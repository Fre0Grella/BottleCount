import { Hono } from 'hono';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import { answerContact, guestName } from '../../../shared/contact';
import { emptyDetails } from '../../../shared/details';
import type { InviteOpenDTO, InvitePartyDTO } from '../../../shared/invites';
import { isInviteAnswer } from '../../../shared/invites';
import type { InvitePaymentDTO } from '../../../shared/payments';
import { invitePayment, isPaidParty } from '../../../shared/payments';
import type { AppEnv } from '../appEnv';
import { deployment } from '../deployment';
import type { Invite } from '../repositories/inviteRepository';
import type { PublishedParty } from '../repositories/partyRepository';
import { fail, readBody, text } from './http';
import { findOpenParty, rateLimit } from './middleware';

type Env = {
  Bindings: AppEnv['Bindings'];
  Variables: AppEnv['Variables'] & { party: PublishedParty };
};

const invites = new Hono<Env>();

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
  env: Env['Bindings'],
): InvitePartyDTO {
  return {
    slug: party.slug,
    name: party.name,
    date: party.date,
    cover: party.cover,
    venue: party.venue,
    // Like payment, read from the stored document; a party published before
    // documents were stored has none to show.
    details: party.document?.details ?? emptyDetails(),
    allowForward: party.allowForward,
    full,
    paid: partyIsPaid(party),
    googleSignIn: deployment(env).guestGoogle,
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

/** How to pay the host, for a guest who has said yes. */
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
  c: Context<Env>,
  party: PublishedParty,
): Promise<boolean> {
  if (party.maxCapacity === null) return false;
  const counted = await c.var.repositories.invites.countConfirmed(party.id);
  return counted.ok && counted.value >= party.maxCapacity;
}

/** What a guest's page shows them, after either endpoint. */
async function inviteOpenDTO(
  c: Context<Env>,
  invite: Invite,
): Promise<InviteOpenDTO> {
  const party = c.get('party');
  return {
    party: toPartyDTO(party, await isFull(c, party), c.env),
    inviteId: invite.id,
    forwardToken: forwardTokenFor(invite, party),
    status: invite.status,
    name: invite.name,
    depth: invite.depth,
    payment: paymentFor(invite, party),
  };
}

/** The party `:slug` names, if its link is open — see `findOpenParty`. */
const openParty = createMiddleware<Env>(async (c, next) => {
  const party = await findOpenParty(
    c.var.repositories,
    c.req.param('slug') ?? '',
  );
  if (!party) return c.json({ error: 'party_not_found' }, 404);
  c.set('party', party);
  await next();
});

// Both endpoints write, so both are rate-limited, before anything is read.
invites.use('/:slug/*', rateLimit('INVITE_RATE_LIMITER'), openParty);

/**
 * `POST /invite/:slug/open` — someone opened the link.
 *
 * A POST rather than a GET because it writes: this is the row that makes
 * "reached" a real number. The client sends back the `inviteId` it was given
 * last time, so a reload, a second device-less visit or a guest returning to
 * change their mind is the same person rather than a new one.
 */
invites.post('/:slug/open', async (c) => {
  const party = c.get('party');
  const body = await readBody(c);

  const opened = await c.var.repositories.invites.open({
    partyId: party.id,
    referrerToken: text(body, 'referrer') || null,
    rootToken: party.rootToken,
    existingInviteId: text(body, 'inviteId') || null,
  });
  if (!opened.ok) return fail(c, opened.error);
  return c.json(await inviteOpenDTO(c, opened.value));
});

/**
 * `POST /invite/:slug/answer` — yes or no.
 *
 * Answering again overwrites: someone who said maybe-then-no, or who mistyped
 * their name, should not need a second row, and a second row would inflate the
 * funnel's "reached" count with people who were only ever one guest.
 */
invites.post('/:slug/answer', async (c) => {
  const party = c.get('party');
  const body = await readBody(c);
  const { inviteId, answer } = body;

  if (typeof inviteId !== 'string' || !isInviteAnswer(answer)) {
    return c.json({ error: 'invalid_answer' }, 400);
  }
  const name = guestName(text(body, 'name'));
  if (name === '') return c.json({ error: 'name_required' }, 400);

  const contact = answerContact(
    answer === 'confirmed',
    partyIsPaid(party),
    text(body, 'email'),
    text(body, 'phone'),
  );
  if ('error' in contact) return c.json({ error: contact.error }, 400);

  const answered = await c.var.repositories.invites.answer({
    inviteId,
    partyId: party.id,
    name,
    answer,
    maxCapacity: party.maxCapacity,
    contact,
  });
  // A stale inviteId (the host unpublished and republished, say) is a 404, so
  // the client knows to open again rather than retrying an answer forever; a
  // full party is a 409.
  if (!answered.ok) return fail(c, answered.error);
  return c.json(await inviteOpenDTO(c, answered.value));
});

export default invites;
