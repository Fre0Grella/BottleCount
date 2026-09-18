import { Hono } from 'hono';
import type { JwtVariables } from 'hono/jwt';
import type {
  HostInviteDTO,
  PublishedPartyDTO,
  PublishPartyRequest,
} from '../../../shared/invites';
import { INVITE_STATUSES } from '../../../shared/invites';
import type { InviteStatus } from '../../../shared/invites';
import { featuresFor, resolveTier } from '../../../shared/tiers';
import type { AppVariables } from '../appEnv';
import { PARTY_ERRORS } from '../repositories/partyRepository';
import type { PublishedParty } from '../repositories/partyRepository';

type Bindings = {
  SELF_HOSTED?: string;
};

const parties = new Hono<{
  Bindings: Bindings;
  Variables: AppVariables & JwtVariables;
}>();

function toPublishedDTO(party: PublishedParty): PublishedPartyDTO {
  return {
    id: party.id,
    slug: party.slug,
    rootToken: party.rootToken,
    publishedAt: party.publishedAt,
    allowForward: party.allowForward,
  };
}

/**
 * Publishing is the paid feature, so the check is here and not only in the UI.
 *
 * It reads the tier from the user's row rather than the JWT: a session lives
 * seven days, and a claim baked into one would keep granting `pro` for a week
 * after a refund.
 */
parties.use('*', async (c, next) => {
  const sub = c.get('jwtPayload')?.sub;
  if (typeof sub !== 'string') return c.json({ error: 'unauthenticated' }, 401);

  const found = await c.var.repositories.users.findById(sub);
  if (!found.ok) return c.json({ error: 'unauthenticated' }, 401);

  const tier = resolveTier({
    storedTier: found.value.tier,
    selfHosted: c.env.SELF_HOSTED === 'true',
  });
  if (!featuresFor(tier).inviteLink) {
    return c.json({ error: 'upgrade_required', feature: 'inviteLink' }, 403);
  }

  c.set('userId', sub);
  return next();
});

function parseSnapshot(body: unknown): PublishPartyRequest | null {
  if (typeof body !== 'object' || body === null) return null;
  const b = body as Partial<PublishPartyRequest>;
  if (typeof b.localId !== 'number' || !Number.isInteger(b.localId))
    return null;
  if (typeof b.name !== 'string' || b.name.trim() === '') return null;
  if (typeof b.date !== 'string') return null;

  const venue = b.venue ?? { place: '', city: '', time: '' };
  return {
    localId: b.localId,
    // Bounded because these are rendered on a page anyone with the link can
    // open; a host is not a threat, but a stolen session is.
    name: b.name.trim().slice(0, 80),
    date: b.date.slice(0, 10),
    cover: Number.isInteger(b.cover) ? Math.max(0, Math.min(5, b.cover!)) : 0,
    venue: {
      place: String(venue.place ?? '').slice(0, 120),
      city: String(venue.city ?? '').slice(0, 80),
      time: String(venue.time ?? '').slice(0, 10),
    },
    allowForward: b.allowForward !== false,
    maxCapacity:
      typeof b.maxCapacity === 'number' && Number.isFinite(b.maxCapacity)
        ? Math.max(1, Math.round(b.maxCapacity))
        : null,
  };
}

/**
 * `POST /api/parties/publish` — make a party openable by link.
 *
 * Idempotent on (owner, localId): the host's share sheet calls it every time it
 * opens, which is what keeps the guest-facing card in step with a renamed party
 * or a moved venue. The slug survives, so links already sent keep working.
 */
parties.post('/publish', async (c) => {
  const userId = c.get('userId') as string;
  const snapshot = parseSnapshot(await c.req.json().catch(() => null));
  if (!snapshot) return c.json({ error: 'invalid_party' }, 400);

  const published = await c.var.repositories.parties.publish(userId, snapshot);
  if (!published.ok) return c.json({ error: published.error }, 500);

  return c.json(toPublishedDTO(published.value));
});

/** `DELETE /api/parties/:localId/publish` — turn the link off for good. */
parties.delete('/:localId/publish', async (c) => {
  const userId = c.get('userId') as string;
  const localId = Number(c.req.param('localId'));
  if (!Number.isInteger(localId))
    return c.json({ error: 'invalid_party' }, 400);

  const found = await c.var.repositories.parties.findByOwnerAndLocalId(
    userId,
    localId,
  );
  // Already gone is the state the caller wanted, so it is not an error.
  if (!found.ok) return c.json({ ok: true });

  const removed = await c.var.repositories.parties.unpublish(
    userId,
    found.value.id,
  );
  if (!removed.ok) return c.json({ error: removed.error }, 500);

  return c.json({ ok: true });
});

/**
 * `GET /api/parties/:localId/invites` — the funnel.
 *
 * Names are in here, which is why it is owner-scoped: the lookup is by
 * (owner, localId), so there is no id a caller could substitute to read someone
 * else's guest list.
 */
parties.get('/:localId/invites', async (c) => {
  const userId = c.get('userId') as string;
  const localId = Number(c.req.param('localId'));
  if (!Number.isInteger(localId))
    return c.json({ error: 'invalid_party' }, 400);

  const found = await c.var.repositories.parties.findByOwnerAndLocalId(
    userId,
    localId,
  );
  if (!found.ok) {
    const status = found.error === PARTY_ERRORS.NOT_FOUND ? 404 : 500;
    return c.json({ error: found.error }, status);
  }

  const listed = await c.var.repositories.invites.listForParty(found.value.id);
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

  return c.json({ party: toPublishedDTO(found.value), invites });
});

/**
 * `PATCH /api/parties/:localId/invites/:inviteId` — the host overriding an answer.
 *
 * Hosts do talk to their guests off-platform ("she told me at work she's
 * coming"), and without this the funnel would poll their change straight back
 * out again a few seconds later. It is deliberately a different route from the
 * guest's own answer: this one is owner-scoped, ignores capacity, and can send
 * a row back to `opened`, none of which a guest may do.
 */
parties.patch('/:localId/invites/:inviteId', async (c) => {
  const userId = c.get('userId') as string;
  const localId = Number(c.req.param('localId'));
  if (!Number.isInteger(localId))
    return c.json({ error: 'invalid_party' }, 400);

  const body = await c.req
    .json<{ status?: string }>()
    .catch(() => ({}) as { status?: string });
  const status = body.status;
  if (!status || !(INVITE_STATUSES as readonly string[]).includes(status)) {
    return c.json({ error: 'invalid_status' }, 400);
  }

  const found = await c.var.repositories.parties.findByOwnerAndLocalId(
    userId,
    localId,
  );
  if (!found.ok) return c.json({ error: found.error }, 404);

  const updated = await c.var.repositories.invites.setStatus({
    inviteId: c.req.param('inviteId'),
    partyId: found.value.id,
    status: status as InviteStatus,
  });
  if (!updated.ok) return c.json({ error: updated.error }, 404);

  return c.json({ ok: true, status: updated.value.status });
});

export default parties;
