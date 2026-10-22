import { Hono } from 'hono';
import type { GuestContact } from '../../../shared/contact';
import { requireContact } from '../../../shared/contact';
import type {
  InviteOpenDTO,
  InviteOpenRequest,
  InvitePartyDTO,
} from '../../../shared/invites';
import { isInviteAnswer } from '../../../shared/invites';
import type { InvitePaymentDTO } from '../../../shared/payments';
import { invitePayment, isPaidParty } from '../../../shared/payments';
import type { AppVariables } from '../appEnv';
import { INVITE_ERRORS } from '../repositories/inviteRepository';
import type { Invite } from '../repositories/inviteRepository';
import type { PublishedParty } from '../repositories/partyRepository';
import { guestGoogleConfigured } from './guestGoogle';

type RateLimiter = { limit(o: { key: string }): Promise<{ success: boolean }> };

type Bindings = {
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
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
 * no other guests' names, no owner identity, no budget — and no contact
 * details, not even the guest's own.
 */

/** Whether confirming needs an email. Read from the stored document, like payment. */
function partyIsPaid(party: PublishedParty): boolean {
  return isPaidParty(party.document);
}

function toPartyDTO(
  party: PublishedParty,
  full: boolean,
  env: Bindings,
): InvitePartyDTO {
  return {
    slug: party.slug,
    name: party.name,
    date: party.date,
    cover: party.cover,
    venue: party.venue,
    allowForward: party.allowForward,
    full,
    paid: partyIsPaid(party),
    googleSignIn: guestGoogleConfigured(env),
  };
}

const NO_CONTACT: GuestContact = { email: null, phone: null };

/**
 * The contact details an answer stores, or the error to refuse it with.
 *
 * Only a yes to a paid party keeps any: they are there to send a ticket to, and
 * someone who declines, or confirms a free party, is not getting one.
 */
function contactFor(
  party: PublishedParty,
  answer: string,
  body: Record<string, unknown>,
): GuestContact | { error: string } {
  if (answer !== 'confirmed' || !partyIsPaid(party)) return NO_CONTACT;

  // At least one of the two — whichever the guest is happier to give.
  const text = (key: string) =>
    typeof body[key] === 'string' ? (body[key] as string) : '';
  return requireContact(text('email'), text('phone'));
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

/**
 * How to pay the host, for a guest who has said yes.
 *
 * Built from the stored document on every read rather than trusted from it: a
 * co-organiser's merge patch reaches the document without passing the publish
 * checks, so this is the one place every identifier is guaranteed to be
 * validated before a guest sees it.
 */
function paymentFor(
  invite: Invite,
  party: PublishedParty,
): InvitePaymentDTO | null {
  if (invite.status !== 'confirmed' || !party.document) return null;
  return invitePayment(
    party.document.settings.ticket_price,
    party.document.payment,
  );
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
    party: toPartyDTO(party, await isFull(c.var.repositories, party), c.env),
    inviteId: invite.id,
    forwardToken: forwardTokenFor(invite, party),
    status: invite.status,
    name: invite.name,
    depth: invite.depth,
    payment: paymentFor(invite, party),
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
  const fields = body as Record<string, unknown>;
  const { inviteId, name, answer } = fields;

  if (typeof inviteId !== 'string' || !isInviteAnswer(answer)) {
    return c.json({ error: 'invalid_answer' }, 400);
  }
  const trimmed = typeof name === 'string' ? name.trim().slice(0, 60) : '';
  if (trimmed === '') return c.json({ error: 'name_required' }, 400);

  const contact = contactFor(party, answer, fields);
  if ('error' in contact) return c.json({ error: contact.error }, 400);

  const answered = await c.var.repositories.invites.answer({
    inviteId,
    partyId: party.id,
    name: trimmed,
    answer,
    maxCapacity: party.maxCapacity,
    contact,
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
    party: toPartyDTO(party, await isFull(c.var.repositories, party), c.env),
    inviteId: invite.id,
    forwardToken: forwardTokenFor(invite, party),
    status: invite.status,
    name: invite.name,
    depth: invite.depth,
    payment: paymentFor(invite, party),
  };
  return c.json(dto);
});

export default invites;
