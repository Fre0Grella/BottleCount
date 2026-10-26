import { Hono } from 'hono';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type {
  CollaboratorInviteDTO,
  PartyDocument,
  PartyMemberDTO,
  PartyRole,
  PartySummaryDTO,
  PatchPartyResponse,
  SharedPartyDTO,
} from '../../../shared/collab';
import { guestName, optionalContact } from '../../../shared/contact';
import {
  COVER_PHOTO_MAX_BYTES,
  sniffCoverPhoto,
} from '../../../shared/coverPhotos';
import type { HostInviteDTO, PublishedPartyDTO } from '../../../shared/invites';
import { INVITE_STATUSES } from '../../../shared/invites';
import type { InviteStatus } from '../../../shared/invites';
import { signedTicketCode } from '../../../shared/ticketLinks';
import { featuresFor } from '../../../shared/tiers';
import type { UserEnv } from '../appEnv';
import { tierFor } from '../deployment';
import {
  coverPhotoResponse,
  deleteCoverPhotos,
  storeCoverPhoto,
} from '../lib/coverPhotos';
import { INVITE_ERRORS } from '../repositories/inviteRepository';
import type {
  Invite,
  InviteWithReferrer,
} from '../repositories/inviteRepository';
import type { PartyMember } from '../repositories/memberRepository';
import { PARTY_ERRORS } from '../repositories/partyRepository';
import type { PublishedParty } from '../repositories/partyRepository';
import type { Repositories } from '../repositories/repositories';
import { fail, readBody, readBytes, respond, text } from './http';
import { findPartyInvite, requireUser } from './middleware';
import { parseDocument, parsePatch } from './partyInput';
import { ticketIsLive } from './tickets';

type Env = {
  Bindings: UserEnv['Bindings'];
  Variables: UserEnv['Variables'] & {
    role: PartyRole;
    party: PublishedParty;
    /** Set on `/:partyId/invites/:inviteId…` routes only. */
    invite: Invite;
  };
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

function toInviteDTO(invite: InviteWithReferrer): HostInviteDTO {
  return {
    id: invite.id,
    name: invite.name,
    status: invite.status,
    depth: invite.depth,
    referrer: invite.referrerName,
    forwardToken: invite.forwardToken,
    ticketCode: invite.ticketCode,
    source: invite.source,
    checkedIn: invite.checkedIn,
    checkedInAt: invite.checkedInAt,
    openedAt: invite.openedAt,
    answeredAt: invite.answeredAt,
    email: invite.email,
    phone: invite.phone,
    paidAt: invite.paidAt,
  };
}

/**
 * One guest as the funnel shows them, after a write that returned the bare
 * row. Their referrer's name is looked up rather than left null: the client
 * folds this into its guest list, and a null there would erase the "via
 * Giulia" the funnel showed a moment ago.
 */
async function hostInvite(
  repositories: Repositories,
  invite: Invite,
): Promise<HostInviteDTO> {
  let referrerName: string | null = null;
  if (invite.referrerId) {
    const referrer = await repositories.invites.findById(invite.referrerId);
    referrerName = referrer.ok ? referrer.value.name : null;
  }
  return toInviteDTO({ ...invite, referrerName });
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
parties.use('*', requireUser);

/**
 * Whether the caller may keep parties of their own on the server.
 *
 * This gates creating a cloud party, and nothing else. Opening, editing and
 * running a party you were invited to is deliberately outside it: that party
 * belongs to someone who has already paid, and charging both people to run one
 * party would make co-organising useless, since you cannot co-organise alone.
 * Membership is the authorisation everywhere else.
 */
async function mayOwnCloudParties(c: Context<Env>): Promise<boolean> {
  const tier = await tierFor(c.var.repositories, c.env, c.get('userId'));
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
const loadParty = createMiddleware<Env>(async (c, next) => {
  const notFound = () => c.json({ error: 'party_not_found' }, 404);
  const partyId = c.req.param('partyId');
  if (!partyId) return notFound();

  const role = await c.var.repositories.members.roleFor(
    partyId,
    c.get('userId'),
  );
  if (!role.ok) return notFound();

  const party = await c.var.repositories.parties.findById(partyId);
  if (!party.ok) return notFound();

  c.set('role', role.value);
  c.set('party', party.value);
  await next();
});

parties.use('/:partyId/*', loadParty);
parties.use('/:partyId', loadParty);

/**
 * Resolves `:inviteId` within the party already loaded. An invite of another
 * party is as absent as one that does not exist — membership of one party is
 * not a key to another's guests.
 */
const loadInvite = createMiddleware<Env>(async (c, next) => {
  const invite = await findPartyInvite(
    c.var.repositories,
    c.get('party').id,
    c.req.param('inviteId') ?? '',
  );
  if (!invite) return fail(c, INVITE_ERRORS.NOT_FOUND);
  c.set('invite', invite);
  await next();
});

parties.use('/:partyId/invites/:inviteId/*', loadInvite);
parties.use('/:partyId/invites/:inviteId', loadInvite);

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
    ticketKey: party.ticketKey,
    // What the party may do: its owner's features, whoever is asking. Read
    // from the owner's row on every request, like `mayOwnCloudParties`, so a
    // refund reaches every co-organiser's screen at their next pull.
    features: featuresFor(
      await tierFor(c.var.repositories, c.env, party.ownerId),
    ),
  };
}

// ── The party itself ────────────────────────────────────────────────────────

/** `GET /api/parties` — everything the caller can open, owned or shared. */
parties.get('/', async (c) => {
  const listed = await c.var.repositories.parties.listForUser(c.get('userId'));
  return respond(c, listed, (rows) => {
    const summaries: PartySummaryDTO[] = rows.map((row) => ({
      id: row.id,
      name: row.name,
      date: row.date,
      cover: row.cover,
      role: row.role,
      version: row.version,
      updatedAt: row.updatedAt,
      memberCount: row.memberCount,
    }));
    return { parties: summaries };
  });
});

/**
 * `POST /api/parties` — put a party on the server, or save it again.
 *
 * Idempotent on (owner, localId). Deliberately does *not* open the invite link:
 * storing a party so a co-organiser can open it is not the same act as opening
 * it to the world.
 */
parties.post('/', async (c) => {
  if (!(await mayOwnCloudParties(c))) {
    return c.json({ error: 'upgrade_required', feature: 'cloudSync' }, 403);
  }

  const parsed = parseDocument(await readBody(c));
  if (!parsed) return c.json({ error: 'invalid_party' }, 400);

  const published = await c.var.repositories.parties.publish(
    c.get('userId'),
    parsed,
  );
  return respond(c, published, (party) =>
    sharedPartyDTO(c, party, parsed.document, 'owner'),
  );
});

/** `GET /api/parties/:partyId` — the document a co-organiser opens. */
parties.get('/:partyId', async (c) => {
  const party = c.get('party');
  if (!party.document) return fail(c, PARTY_ERRORS.NO_DOCUMENT);
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
  const parsed = parsePatch(await readBody(c));
  if (!parsed) return c.json({ error: 'invalid_patch' }, 400);

  const applied = await c.var.repositories.parties.patchDocument({
    partyId: party.id,
    patch: parsed.patch,
  });
  return respond(c, applied, (value): PatchPartyResponse => {
    const wasCurrent = parsed.baseVersion === party.version;
    return {
      version: value.version,
      document: wasCurrent ? null : value.document,
      updatedAt: value.updatedAt,
    };
  });
});

/** `DELETE /api/parties/:partyId` — owner only; members and invites cascade. */
parties.delete('/:partyId', async (c) => {
  if (!ownerOnly(c)) return c.json({ error: 'owner_only' }, 403);

  // Already gone is the state the caller wanted.
  const partyId = c.get('party').id;
  await c.var.repositories.parties.deleteById(partyId);
  // The photo goes with the party (ADR 0007): nothing would ever serve it
  // again, and it may show people.
  if (c.env.COVER_PHOTOS) await deleteCoverPhotos(c.env.COVER_PHOTOS, partyId);
  return c.json({ ok: true });
});

// ── The cover photo (ADR 0007) ──────────────────────────────────────────────

/**
 * `PUT /api/parties/:partyId/cover` — the raw bytes of a photo or poster the
 * browser has already shrunk and re-encoded. Any member may set it, on a party
 * whose owner has the feature, like everything else about a Pro party.
 *
 * The document is pointed at the new photo here rather than left to the
 * client's next patch, so the photo and the document that names it change
 * together; the previous photo is deleted on the way.
 */
parties.put('/:partyId/cover', async (c) => {
  const bucket = c.env.COVER_PHOTOS;
  if (!bucket) return c.json({ error: 'cover_photos_unavailable' }, 501);

  const party = c.get('party');
  const tier = await tierFor(c.var.repositories, c.env, party.ownerId);
  if (!featuresFor(tier).coverPhotos) {
    return c.json({ error: 'upgrade_required', feature: 'coverPhotos' }, 403);
  }
  if (!party.document) return fail(c, PARTY_ERRORS.NO_DOCUMENT);

  const bytes = await readBytes(c, COVER_PHOTO_MAX_BYTES);
  if (!bytes) return c.json({ error: 'cover_photo_too_large' }, 413);
  const type = sniffCoverPhoto(bytes);
  if (!type) return c.json({ error: 'not_a_photo' }, 415);

  const token = await storeCoverPhoto(bucket, party.id, bytes, type);
  const patched = await c.var.repositories.parties.patchDocument({
    partyId: party.id,
    patch: { coverPhoto: token },
  });
  return respond(c, patched, (value) => ({ token, version: value.version }));
});

/** `DELETE /api/parties/:partyId/cover` — back to the emoji cover. */
parties.delete('/:partyId/cover', async (c) => {
  const party = c.get('party');
  if (c.env.COVER_PHOTOS) await deleteCoverPhotos(c.env.COVER_PHOTOS, party.id);
  if (!party.document) return c.json({ ok: true });
  const patched = await c.var.repositories.parties.patchDocument({
    partyId: party.id,
    patch: { coverPhoto: '' },
  });
  return respond(c, patched, (value) => ({ version: value.version }));
});

/**
 * `GET /api/parties/:partyId/cover/:token` — the photo, for its organisers.
 * A token is never reused, so the bytes behind one never change.
 */
parties.get('/:partyId/cover/:token', async (c) => {
  const bucket = c.env.COVER_PHOTOS;
  const photo =
    bucket &&
    (await coverPhotoResponse(
      bucket,
      c.get('party').id,
      c.req.param('token'),
      'private, max-age=31536000, immutable',
    ));
  return photo || c.json({ error: 'cover_photo_not_found' }, 404);
});

// ── The guest-facing invite link ────────────────────────────────────────────

/** `POST /api/parties/:partyId/invite-link` — open the party to RSVPs. */
parties.post('/:partyId/invite-link', async (c) => {
  const opened = await c.var.repositories.parties.setInvitesOpen(
    c.get('party').id,
    true,
  );
  return respond(c, opened, toPublishedDTO);
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
  return respond(c, closed, () => ({ ok: true }));
});

// ── The funnel ──────────────────────────────────────────────────────────────

/** `GET /api/parties/:partyId/invites` — the RSVP funnel. Any member. */
parties.get('/:partyId/invites', async (c) => {
  const party = c.get('party');
  const listed = await c.var.repositories.invites.listForParty(party.id);
  return respond(c, listed, (invites) => ({
    party: toPublishedDTO(party),
    invites: invites.map(toInviteDTO),
  }));
});

/**
 * `POST /api/parties/:partyId/invites` — a guest an organiser types in.
 *
 * On a shared party this has to be a server row, not a local one. It is what
 * lets the co-organiser see them at all, and what gives them a ticket code the
 * second phone on the door can check.
 */
parties.post('/:partyId/invites', async (c) => {
  const body = await readBody(c);
  const name = guestName(text(body, 'name'));
  if (!name) return c.json({ error: 'name_required' }, 400);

  const contact = optionalContact(text(body, 'email'), text(body, 'phone'));
  if ('error' in contact) return c.json({ error: contact.error }, 400);

  const added = await c.var.repositories.invites.addManual({
    partyId: c.get('party').id,
    name,
    contact,
  });
  // Typed in by an organiser, so referred by nobody.
  return respond(c, added, (invite) =>
    toInviteDTO({ ...invite, referrerName: null }),
  );
});

/**
 * `POST /api/parties/:partyId/invites/:inviteId/check-in` — they walked in.
 *
 * The server decides, not the scanning phone. A second scan answers 409 with
 * the time of the first, so whichever phone is holding the queue up can say
 * "already scanned at 23:14" rather than silently admitting them twice.
 */
parties.post('/:partyId/invites/:inviteId/check-in', async (c) => {
  const invite = c.get('invite');
  const checked = await c.var.repositories.invites.checkIn({
    inviteId: invite.id,
    partyId: invite.partyId,
    at: new Date().toISOString(),
  });

  if (!checked.ok && checked.error === INVITE_ERRORS.ALREADY_CHECKED_IN) {
    // Read again rather than taken from the invite loaded above: two phones
    // scanning at once both loaded it before either checked in, and the one
    // that lost needs the winner's time.
    const existing = await c.var.repositories.invites.findById(invite.id);
    return c.json(
      {
        error: checked.error,
        checkedInAt: existing.ok ? existing.value.checkedInAt : null,
      },
      409,
    );
  }
  return respond(c, checked, (row) => hostInvite(c.var.repositories, row));
});

/** `DELETE …/check-in` — for the guest waved through by mistake. */
parties.delete('/:partyId/invites/:inviteId/check-in', async (c) => {
  const invite = c.get('invite');
  const undone = await c.var.repositories.invites.undoCheckIn({
    inviteId: invite.id,
    partyId: invite.partyId,
  });
  return respond(c, undone, (row) => hostInvite(c.var.repositories, row));
});

/**
 * `PUT /api/parties/:partyId/invites/:inviteId/contact` — where to send their
 * ticket. Any organiser; replaces both fields.
 */
parties.put('/:partyId/invites/:inviteId/contact', async (c) => {
  const body = await readBody(c);
  const contact = optionalContact(text(body, 'email'), text(body, 'phone'));
  if ('error' in contact) return c.json({ error: contact.error }, 400);

  const invite = c.get('invite');
  const updated = await c.var.repositories.invites.setContact({
    inviteId: invite.id,
    partyId: invite.partyId,
    contact,
  });
  return respond(c, updated, (row) => hostInvite(c.var.repositories, row));
});

/**
 * `POST /api/parties/:partyId/invites/:inviteId/paid` — an organiser saw the
 * money arrive. Any organiser, like check-in: the server holds the answer, so
 * every organiser's phone agrees on who has paid (ADR 0005).
 */
parties.post('/:partyId/invites/:inviteId/paid', async (c) => {
  const invite = c.get('invite');
  const marked = await c.var.repositories.invites.setPaid({
    inviteId: invite.id,
    partyId: invite.partyId,
    at: new Date().toISOString(),
  });
  return respond(c, marked, (row) => hostInvite(c.var.repositories, row));
});

/** `DELETE …/paid` — marked by mistake, or the payment was refunded. */
parties.delete('/:partyId/invites/:inviteId/paid', async (c) => {
  const invite = c.get('invite');
  const unmarked = await c.var.repositories.invites.setPaid({
    inviteId: invite.id,
    partyId: invite.partyId,
    at: null,
  });
  return respond(c, unmarked, (row) => hostInvite(c.var.repositories, row));
});

/**
 * `PUT /api/parties/:partyId/invites/:inviteId/ticket` — store the guest's
 * signed ticket and hand back the short link's slug (#41).
 *
 * The organiser's browser signs the ticket, as it always has (ADR 0004); this
 * only keeps the result so `/t/<slug>` can serve it. It refuses a ticket the
 * guest should not have yet — someone not coming, or not paid on a party
 * guests pay for — so #33's rule holds on the server too, and a ticket whose
 * code is another guest's.
 */
parties.put('/:partyId/invites/:inviteId/ticket', async (c) => {
  const signed = text(await readBody(c), 'signed');
  const code = signedTicketCode(signed);
  if (code === null) return c.json({ error: 'invalid_ticket' }, 400);

  const party = c.get('party');
  const invite = c.get('invite');

  if (invite.ticketCode && code !== invite.ticketCode) {
    return c.json({ error: 'ticket_mismatch' }, 400);
  }
  if (!ticketIsLive({ ...invite, ticketSigned: signed }, party)) {
    return c.json({ error: 'ticket_not_ready' }, 409);
  }

  const stored = await c.var.repositories.invites.setTicket({
    inviteId: invite.id,
    partyId: party.id,
    signed,
  });
  return respond(c, stored, (row) => ({ slug: row.ticketSlug }));
});

/** `PATCH /api/parties/:partyId/invites/:inviteId` — override an answer. */
parties.patch('/:partyId/invites/:inviteId', async (c) => {
  const status = text(await readBody(c), 'status');
  if (!(INVITE_STATUSES as readonly string[]).includes(status)) {
    return c.json({ error: 'invalid_status' }, 400);
  }

  const invite = c.get('invite');
  const updated = await c.var.repositories.invites.setStatus({
    inviteId: invite.id,
    partyId: invite.partyId,
    status: status as InviteStatus,
  });
  return respond(c, updated, (row) => ({ ok: true, status: row.status }));
});

// ── Co-organisers ───────────────────────────────────────────────────────────

/** `GET /api/parties/:partyId/members` — who is on this party. */
parties.get('/:partyId/members', async (c) => {
  const members = await c.var.repositories.members.listMembers(
    c.get('party').id,
  );
  return respond(c, members, (rows) => ({ members: rows.map(toMemberDTO) }));
});

/**
 * `POST /api/parties/:partyId/members/invite` — mint a link to co-organise.
 *
 * Owner only. An editor who could invite could add someone the owner has just
 * removed, which would make removal meaningless.
 */
parties.post('/:partyId/members/invite', async (c) => {
  if (!ownerOnly(c)) return c.json({ error: 'owner_only' }, 403);

  const invite = await c.var.repositories.members.createInvite({
    partyId: c.get('party').id,
    createdBy: c.get('userId'),
  });
  return respond(
    c,
    invite,
    (value): CollaboratorInviteDTO => ({
      token: value.token,
      createdAt: value.createdAt,
    }),
  );
});

/** `DELETE /api/parties/:partyId/members/invites` — revoke outstanding links. */
parties.delete('/:partyId/members/invites', async (c) => {
  if (!ownerOnly(c)) return c.json({ error: 'owner_only' }, 403);

  const revoked = await c.var.repositories.members.revokeInvitesFor(
    c.get('party').id,
  );
  return respond(c, revoked, () => ({ ok: true }));
});

/**
 * `DELETE /api/parties/:partyId/members/:userId` — remove a co-organiser, or
 * leave a party you were added to.
 */
parties.delete('/:partyId/members/:userId', async (c) => {
  const target = c.req.param('userId');

  // Anyone may remove themselves; only the owner may remove anybody else.
  if (target !== c.get('userId') && !ownerOnly(c)) {
    return c.json({ error: 'owner_only' }, 403);
  }

  const removed = await c.var.repositories.members.remove(
    c.get('party').id,
    target,
  );
  return respond(c, removed, () => ({ ok: true }));
});

export default parties;
