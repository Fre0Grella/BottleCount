import { Hono } from 'hono';
import { isPaidParty } from '../../../shared/payments';
import type { TicketLinkDTO } from '../../../shared/ticketLinks';
import { isTicketSlug } from '../../../shared/ticketLinks';
import type { AppVariables } from '../appEnv';
import type { Invite } from '../repositories/inviteRepository';
import type { PublishedParty } from '../repositories/partyRepository';

type RateLimiter = { limit(o: { key: string }): Promise<{ success: boolean }> };

type Bindings = {
  // Separate from the invite limiter, and far more generous: a ticket page is
  // opened at the door, where a venue's Wi-Fi or a carrier's shared address
  // puts dozens of guests behind one IP at once. A guest stuck outside because
  // the page was throttled is worse than anything the limiter prevents — the
  // slug's 60 bits are what stop enumeration. Absent locally: unlimited.
  TICKET_RATE_LIMITER?: RateLimiter;
};

const tickets = new Hono<{ Bindings: Bindings; Variables: AppVariables }>();

/**
 * Whether a stored ticket may still be shown. The same rule as making one:
 * the guest is coming, and on a party guests pay for, they have paid. An
 * organiser who un-marks a payment or a guest who changes to no takes the
 * link down with it.
 */
export function ticketIsLive(invite: Invite, party: PublishedParty): boolean {
  if (invite.status !== 'confirmed' || !invite.ticketSigned) return false;
  const paid =
    !!party.document &&
    isPaidParty(party.document.settings.ticket_price, party.document.payment);
  return !paid || invite.paidAt !== null;
}

/**
 * `GET /ticket/:slug` — the ticket a short link names.
 *
 * Public and unauthenticated, like the invite endpoints: the slug is the only
 * credential, so this returns the ticket and the party's card and nothing else
 * — no email, no phone, no payment state. Every way of not finding a live
 * ticket answers the same 404, so a link cannot be probed for whether it
 * existed, was revoked or never did.
 */
tickets.get('/:slug', async (c) => {
  const limiter = c.env.TICKET_RATE_LIMITER;
  if (limiter) {
    const key = c.req.header('cf-connecting-ip') ?? 'unknown';
    if (!(await limiter.limit({ key })).success) {
      return c.json({ error: 'rate_limited' }, 429);
    }
  }

  const notFound = () =>
    c.json({ error: 'ticket_not_found' }, 404, { 'cache-control': 'no-store' });

  const slug = c.req.param('slug');
  if (!isTicketSlug(slug)) return notFound();

  const invite = await c.var.repositories.invites.findByTicketSlug(slug);
  if (!invite.ok) return notFound();
  const party = await c.var.repositories.parties.findById(invite.value.partyId);
  if (!party.ok || !ticketIsLive(invite.value, party.value)) return notFound();

  const p = party.value;
  const dto: TicketLinkDTO = {
    signed: invite.value.ticketSigned!,
    party: p.name,
    date: p.date,
    cover: p.cover,
    ...(p.venue.time ? { time: p.venue.time } : {}),
  };
  // A ticket can be revoked, so no cache may keep serving it afterwards.
  return c.json(dto, 200, { 'cache-control': 'no-store' });
});

export default tickets;
