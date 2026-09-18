import { Hono } from 'hono';
import type {
  InviteOpenDTO,
  InviteOpenRequest,
  InvitePartyDTO,
} from '../../../shared/invites';
import { isInviteAnswer } from '../../../shared/invites';
import type { AppVariables } from '../appEnv';
import { INVITE_ERRORS } from '../repositories/inviteRepository';
import type { Invite } from '../repositories/inviteRepository';
import type { PublishedParty } from '../repositories/partyRepository';

type RateLimiter = { limit(o: { key: string }): Promise<{ success: boolean }> };

type Bindings = {
  // Optional: the local environment leaves it unbound so a fresh clone runs
  // without a Cloudflare account. Absent means unlimited, which is correct for
  // a machine only you can reach.
  INVITE_RATE_LIMITER?: RateLimiter;
};

const invites = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

/**
 * Public, unauthenticated, and mounted outside the `/api/*` guard.
 *
 * A guest has no account by design — being able to RSVP without signing up is
 * most of the value of an invite link. So the URL is the only credential, and
 * these handlers must never return anything the link holder should not see:
 * no other guests' names, no owner identity, no budget.
 */

function toPartyDTO(party: PublishedParty, full: boolean): InvitePartyDTO {
  return {
    slug: party.slug,
    name: party.name,
    date: party.date,
    cover: party.cover,
    venue: party.venue,
    allowForward: party.allowForward,
    full,
  };
}

/**
 * A guest's own forward link exists only once they have confirmed and only if
 * the host allows forwarding. Handing it out at `opened` would let someone who
 * never replied seed a referral tree.
 */
function forwardTokenFor(invite: Invite, party: PublishedParty): string | null {
  if (!party.allowForward) return null;
  return invite.status === 'confirmed' ? invite.forwardToken : null;
}

async function isFull(
  repositories: AppVariables['repositories'],
  party: PublishedParty,
): Promise<boolean> {
  if (party.maxCapacity === null) return false;
  const counted = await repositories.invites.countConfirmed(party.id);
  return counted.ok && counted.value >= party.maxCapacity;
}

/** Guards the two write paths. Keyed on IP, since there is no account to key on. */
async function rateLimited(
  limiter: RateLimiter | undefined,
  c: { req: { header(name: string): string | undefined } },
): Promise<boolean> {
  if (!limiter) return false;
  const key = c.req.header('cf-connecting-ip') ?? 'unknown';
  const { success } = await limiter.limit({ key });
  return !success;
}

/**
 * `POST /invite/:slug/open` — someone opened the link.
 *
 * A POST rather than a GET because it writes: this is the row that makes
 * "reached" a real number. The client sends back the `inviteId` it was given
 * last time, so a reload, a second device-less visit or a guest returning to
 * change their mind is the same person rather than a new one.
 */
invites.post('/:slug/open', async (c) => {
  if (await rateLimited(c.env.INVITE_RATE_LIMITER, c)) {
    return c.json({ error: 'rate_limited' }, 429);
  }

  const found = await c.var.repositories.parties.findBySlug(
    c.req.param('slug'),
  );
  // A party that does not exist, one whose link the owner closed, and one
  // stored only so a co-organiser could open it all answer alike: there is
  // nothing useful to tell a link holder apart from "this is not a party", and
  // distinguishing them would leak that a slug is real.
  if (!found.ok || !found.value.invitesOpen) {
    return c.json({ error: 'party_not_found' }, 404);
  }
  const party = found.value;

  const body = await c.req
    .json<InviteOpenRequest>()
    .catch(() => ({}) as InviteOpenRequest);

  const opened = await c.var.repositories.invites.open({
    partyId: party.id,
    referrerToken: body.referrer ?? null,
    rootToken: party.rootToken,
    existingInviteId: body.inviteId ?? null,
  });
  if (!opened.ok) return c.json({ error: opened.error }, 500);

  const invite = opened.value;
  const dto: InviteOpenDTO = {
    party: toPartyDTO(party, await isFull(c.var.repositories, party)),
    inviteId: invite.id,
    forwardToken: forwardTokenFor(invite, party),
    status: invite.status,
    name: invite.name,
    depth: invite.depth,
  };
  return c.json(dto);
});

/**
 * `POST /invite/:slug/answer` — yes or no.
 *
 * Answering again overwrites: someone who said maybe-then-no, or who mistyped
 * their name, should not need a second row, and a second row would inflate the
 * funnel's "reached" count with people who were only ever one guest.
 */
invites.post('/:slug/answer', async (c) => {
  if (await rateLimited(c.env.INVITE_RATE_LIMITER, c)) {
    return c.json({ error: 'rate_limited' }, 429);
  }

  const found = await c.var.repositories.parties.findBySlug(
    c.req.param('slug'),
  );
  if (!found.ok || !found.value.invitesOpen) {
    return c.json({ error: 'party_not_found' }, 404);
  }
  const party = found.value;

  const body = await c.req.json<unknown>().catch(() => null);
  if (typeof body !== 'object' || body === null) {
    return c.json({ error: 'invalid_answer' }, 400);
  }
  const { inviteId, name, answer } = body as Record<string, unknown>;

  if (typeof inviteId !== 'string' || !isInviteAnswer(answer)) {
    return c.json({ error: 'invalid_answer' }, 400);
  }
  const trimmed = typeof name === 'string' ? name.trim().slice(0, 60) : '';
  if (trimmed === '') return c.json({ error: 'name_required' }, 400);

  const answered = await c.var.repositories.invites.answer({
    inviteId,
    partyId: party.id,
    name: trimmed,
    answer,
    maxCapacity: party.maxCapacity,
  });

  if (!answered.ok) {
    if (answered.error === INVITE_ERRORS.PARTY_FULL) {
      return c.json({ error: answered.error }, 409);
    }
    // A stale inviteId (the host unpublished and republished, say) is a 404, so
    // the client knows to open again rather than retrying an answer forever.
    return c.json({ error: answered.error }, 404);
  }

  const invite = answered.value;
  const dto: InviteOpenDTO = {
    party: toPartyDTO(party, await isFull(c.var.repositories, party)),
    inviteId: invite.id,
    forwardToken: forwardTokenFor(invite, party),
    status: invite.status,
    name: invite.name,
    depth: invite.depth,
  };
  return c.json(dto);
});

export default invites;
