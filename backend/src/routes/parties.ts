import { Hono } from 'hono';
import type { Context } from 'hono';
import type { JwtVariables } from 'hono/jwt';
import type {
  CollaboratorInviteDTO,
  PartyDocument,
  PartyMemberDTO,
  PartyRole,
  PartySummaryDTO,
  PatchPartyResponse,
  SharedPartyDTO,
} from '../../../shared/collab';
import type { HostInviteDTO, PublishedPartyDTO } from '../../../shared/invites';
import { INVITE_STATUSES } from '../../../shared/invites';
import type { InviteStatus } from '../../../shared/invites';
import { featuresFor, resolveTier } from '../../../shared/tiers';
import type { AppVariables } from '../appEnv';
import { MEMBER_ERRORS } from '../repositories/memberRepository';
import type { PartyMember } from '../repositories/memberRepository';
import { PARTY_ERRORS } from '../repositories/partyRepository';
import type { PublishedParty } from '../repositories/partyRepository';
import { parseDocument, parsePatch } from './partyInput';

type Bindings = {
  SELF_HOSTED?: string;
};

type Env = {
  Bindings: Bindings;
  Variables: AppVariables &
    JwtVariables & { role: PartyRole; party: PublishedParty };
};

const parties = new Hono<Env>();

function toPublishedDTO(party: PublishedParty): PublishedPartyDTO {
  return {
    id: party.id,
    slug: party.slug,
    rootToken: party.rootToken,
    publishedAt: party.publishedAt,
    allowForward: party.allowForward,
  };
}

function toMemberDTO(member: PartyMember): PartyMemberDTO {
  return {
    userId: member.userId,
    email: member.email,
    name: member.name,
    picture: member.picture,
    role: member.role,
    addedAt: member.addedAt,
  };
}

/** Everything here needs a session. What it does not all need is a tier. */
parties.use('*', async (c, next) => {
  const sub = c.get('jwtPayload')?.sub;
  if (typeof sub !== 'string') return c.json({ error: 'unauthenticated' }, 401);
  c.set('userId', sub);
  return next();
});

/**
 * Whether the caller may keep parties of their own on the server.
 *
 * This gates creating a cloud party, and nothing else. Opening, editing and
 * running a party you were invited to is deliberately outside it: that party
 * belongs to someone who has already paid, and charging both people to run one
 * party would make co-organising useless, since you cannot co-organise alone.
 * Membership is the authorisation everywhere else.
 *
 * The tier comes from the user's row rather than the JWT: a session lives seven
 * days, and a claim baked into one would keep granting `pro` for a week after a
 * refund.
 */
async function mayOwnCloudParties(c: Context<Env>): Promise<boolean> {
  const found = await c.var.repositories.users.findById(
    c.get('userId') as string,
  );
  if (!found.ok) return false;

  const tier = resolveTier({
    storedTier: found.value.tier,
    selfHosted: c.env.SELF_HOSTED === 'true',
  });
  return featuresFor(tier).cloudSync;
}

/**
 * Resolves `:partyId` and the caller's role on it.
 *
 * Membership *is* the authorisation: a party the caller is not a member of
 * answers 404, not 403, so a party id cannot be probed for existence. That is
 * also why every party route is keyed on the server's id rather than the
 * owner's local one — a co-organiser has their own local numbering, and it
 * means nothing here.
 */
async function loadParty(c: Context<Env>): Promise<Response | null> {
  const userId = c.get('userId') as string;
  const partyId = c.req.param('partyId');
  if (!partyId) return c.json({ error: 'party_not_found' }, 404);

  const role = await c.var.repositories.members.roleFor(partyId, userId);
  if (!role.ok) return c.json({ error: 'party_not_found' }, 404);

  const party = await c.var.repositories.parties.findById(partyId);
  if (!party.ok) return c.json({ error: 'party_not_found' }, 404);

  c.set('role', role.value);
  c.set('party', party.value);
  return null;
}

parties.use('/:partyId/*', async (c, next) => {
  const refused = await loadParty(c);
  return refused ?? next();
});
parties.use('/:partyId', async (c, next) => {
  const refused = await loadParty(c);
  return refused ?? next();
});

/** Actions that take the party away from everyone else stay with the owner. */
function ownerOnly(c: Context<Env>): boolean {
  return c.get('role') === 'owner';
}

async function sharedPartyDTO(
  c: Context<Env>,
  party: PublishedParty,
  document: PartyDocument,
  role: PartyRole,
): Promise<SharedPartyDTO> {
  const members = await c.var.repositories.members.listMembers(party.id);
  return {
    id: party.id,
    document,
    version: party.version,
    role,
    members: members.ok ? members.value.map(toMemberDTO) : [],
    updatedAt: party.updatedAt,
    // Only present while the link is open, so a collaborator cannot hand out a
    // link the owner has closed.
    publication: party.invitesOpen
      ? { slug: party.slug, rootToken: party.rootToken }
      : null,
  };
}

// ── The party itself ────────────────────────────────────────────────────────

/** `GET /api/parties` — everything the caller can open, owned or shared. */
parties.get('/', async (c) => {
  const userId = c.get('userId') as string;
  const listed = await c.var.repositories.parties.listForUser(userId);
  if (!listed.ok) return c.json({ error: listed.error }, 500);

  const summaries: PartySummaryDTO[] = listed.value.map((row) => ({
    id: row.id,
    name: row.name,
    date: row.date,
    cover: row.cover,
    role: row.role,
    version: row.version,
    updatedAt: row.updatedAt,
    memberCount: row.memberCount,
  }));
  return c.json({ parties: summaries });
});

/**
 * `POST /api/parties` — put a party on the server, or save it again.
 *
 * Idempotent on (owner, localId). Deliberately does *not* open the invite link:
 * storing a party so a co-organiser can open it is not the same act as opening
 * it to the world.
 */
parties.post('/', async (c) => {
  const userId = c.get('userId') as string;
  if (!(await mayOwnCloudParties(c))) {
    return c.json({ error: 'upgrade_required', feature: 'cloudSync' }, 403);
  }

  const body = await c.req.json().catch(() => null);
  const parsed = parseDocument(body);
  if (!parsed) return c.json({ error: 'invalid_party' }, 400);

  const published = await c.var.repositories.parties.publish(userId, parsed);
  if (!published.ok) return c.json({ error: published.error }, 500);

  const party = published.value;
  return c.json(await sharedPartyDTO(c, party, parsed.document, 'owner'));
});

/** `GET /api/parties/:partyId` — the document a co-organiser opens. */
parties.get('/:partyId', async (c) => {
  const party = c.get('party');
  if (!party.document) return c.json({ error: PARTY_ERRORS.NO_DOCUMENT }, 409);
  return c.json(await sharedPartyDTO(c, party, party.document, c.get('role')));
});

/**
 * `PATCH /api/parties/:partyId` — one organiser's edit.
 *
 * A patch rather than the whole party, so two people editing different parts of
 * it do not overwrite each other (`shared/patch.ts`). `baseVersion` is reported
 * on, not enforced: rejecting a stale write would lose an edit that merges
 * perfectly well, so instead a client that had fallen behind gets the merged
 * document back and catches up.
 */
parties.patch('/:partyId', async (c) => {
  const party = c.get('party');
  const body = await c.req.json().catch(() => null);
  const parsed = parsePatch(body);
  if (!parsed) return c.json({ error: 'invalid_patch' }, 400);

  const applied = await c.var.repositories.parties.patchDocument({
    partyId: party.id,
    patch: parsed.patch,
  });
  if (!applied.ok) {
    const status = applied.error === PARTY_ERRORS.NOT_FOUND ? 404 : 409;
    return c.json({ error: applied.error }, status);
  }

  const wasCurrent = parsed.baseVersion === party.version;
  const response: PatchPartyResponse = {
    version: applied.value.version,
    document: wasCurrent ? null : applied.value.document,
    updatedAt: applied.value.updatedAt,
  };
  return c.json(response);
});

/** `DELETE /api/parties/:partyId` — owner only; members and invites cascade. */
parties.delete('/:partyId', async (c) => {
  if (!ownerOnly(c)) return c.json({ error: 'owner_only' }, 403);

  const removed = await c.var.repositories.parties.deleteById(
    c.get('party').id,
  );
  // Already gone is the state the caller wanted.
  return removed.ok ? c.json({ ok: true }) : c.json({ ok: true });
});

// ── The guest-facing invite link ────────────────────────────────────────────

/** `POST /api/parties/:partyId/invite-link` — open the party to RSVPs. */
parties.post('/:partyId/invite-link', async (c) => {
  const opened = await c.var.repositories.parties.setInvitesOpen(
    c.get('party').id,
    true,
  );
  if (!opened.ok) return c.json({ error: opened.error }, 500);
  return c.json(toPublishedDTO(opened.value));
});

/**
 * `DELETE /api/parties/:partyId/invite-link` — close it.
 *
 * Owner only: a co-organiser turning off the link would invalidate invitations
 * the owner has already sent, which is not an edit, it is a decision.
 */
parties.delete('/:partyId/invite-link', async (c) => {
  if (!ownerOnly(c)) return c.json({ error: 'owner_only' }, 403);

  const closed = await c.var.repositories.parties.setInvitesOpen(
    c.get('party').id,
    false,
  );
  if (!closed.ok) return c.json({ error: closed.error }, 500);
  return c.json({ ok: true });
});

// ── The funnel ──────────────────────────────────────────────────────────────

/** `GET /api/parties/:partyId/invites` — the RSVP funnel. Any member. */
parties.get('/:partyId/invites', async (c) => {
  const party = c.get('party');
  const listed = await c.var.repositories.invites.listForParty(party.id);
  if (!listed.ok) return c.json({ error: listed.error }, 500);

  const invites: HostInviteDTO[] = listed.value.map((invite) => ({
    id: invite.id,
    name: invite.name,
    status: invite.status,
    depth: invite.depth,
    referrer: invite.referrerName,
    forwardToken: invite.forwardToken,
    openedAt: invite.openedAt,
    answeredAt: invite.answeredAt,
  }));

  return c.json({ party: toPublishedDTO(party), invites });
});

/** `PATCH /api/parties/:partyId/invites/:inviteId` — override an answer. */
parties.patch('/:partyId/invites/:inviteId', async (c) => {
  const body = await c.req
    .json<{ status?: string }>()
    .catch(() => ({}) as { status?: string });
  const status = body.status;
  if (!status || !(INVITE_STATUSES as readonly string[]).includes(status)) {
    return c.json({ error: 'invalid_status' }, 400);
  }

  const updated = await c.var.repositories.invites.setStatus({
    inviteId: c.req.param('inviteId'),
    partyId: c.get('party').id,
    status: status as InviteStatus,
  });
  if (!updated.ok) return c.json({ error: updated.error }, 404);

  return c.json({ ok: true, status: updated.value.status });
});

// ── Co-organisers ───────────────────────────────────────────────────────────

/** `GET /api/parties/:partyId/members` — who is on this party. */
parties.get('/:partyId/members', async (c) => {
  const members = await c.var.repositories.members.listMembers(
    c.get('party').id,
  );
  if (!members.ok) return c.json({ error: members.error }, 500);
  return c.json({ members: members.value.map(toMemberDTO) });
});

/**
 * `POST /api/parties/:partyId/members/invite` — mint a link to co-organise.
 *
 * Owner only. An editor who could invite could add someone the owner has just
 * removed, which would make removal meaningless.
 */
parties.post('/:partyId/members/invite', async (c) => {
  if (!ownerOnly(c)) return c.json({ error: 'owner_only' }, 403);

  const userId = c.get('userId') as string;
  const invite = await c.var.repositories.members.createInvite({
    partyId: c.get('party').id,
    createdBy: userId,
  });
  if (!invite.ok) return c.json({ error: invite.error }, 500);

  const dto: CollaboratorInviteDTO = {
    token: invite.value.token,
    createdAt: invite.value.createdAt,
  };
  return c.json(dto);
});

/** `DELETE /api/parties/:partyId/members/invites` — revoke outstanding links. */
parties.delete('/:partyId/members/invites', async (c) => {
  if (!ownerOnly(c)) return c.json({ error: 'owner_only' }, 403);

  const revoked = await c.var.repositories.members.revokeInvitesFor(
    c.get('party').id,
  );
  if (!revoked.ok) return c.json({ error: revoked.error }, 500);
  return c.json({ ok: true });
});

/**
 * `DELETE /api/parties/:partyId/members/:userId` — remove a co-organiser, or
 * leave a party you were added to.
 */
parties.delete('/:partyId/members/:userId', async (c) => {
  const userId = c.get('userId') as string;
  const target = c.req.param('userId');

  // Anyone may remove themselves; only the owner may remove anybody else.
  if (target !== userId && !ownerOnly(c)) {
    return c.json({ error: 'owner_only' }, 403);
  }

  const removed = await c.var.repositories.members.remove(
    c.get('party').id,
    target,
  );
  if (!removed.ok) {
    const status =
      removed.error === MEMBER_ERRORS.CANNOT_REMOVE_OWNER ? 409 : 404;
    return c.json({ error: removed.error }, status);
  }
  return c.json({ ok: true });
});

export default parties;
