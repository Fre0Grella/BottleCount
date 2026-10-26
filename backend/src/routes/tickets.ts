import type { Context } from 'hono';
import { Hono } from 'hono';
import type { TicketLinkDTO } from '../../../shared/ticketLinks';
import { isTicketSlug } from '../../../shared/ticketLinks';
import { ticketState } from '../../../shared/tickets';
import type { AppEnv } from '../appEnv';
import { coverPhotoResponse } from '../lib/coverPhotos';
import type { Invite } from '../repositories/inviteRepository';
import type { PublishedParty } from '../repositories/partyRepository';
import { rateLimit } from './middleware';

const tickets = new Hono<AppEnv>();

/**
 * Whether a stored ticket may still be shown. The same rule as making one
 * (`ticketState`): the guest is coming, and on a party guests pay for, they
 * have paid. An organiser who un-marks a payment or a guest who changes to no
 * takes the link down with it.
 */
export function ticketIsLive(invite: Invite, party: PublishedParty): boolean {
  return (
    !!invite.ticketSigned && ticketState(invite, party.document) === 'live'
  );
}

/**
 * The live ticket a short link names and its party, or null. Every way of not
 * finding one is the same null, so a link cannot be probed for whether it
 * existed, was revoked or never did.
 */
async function liveTicket(
  c: Context<AppEnv>,
): Promise<{ invite: Invite; party: PublishedParty } | null> {
  const slug = c.req.param('slug');
  if (!slug || !isTicketSlug(slug)) return null;

  const invite = await c.var.repositories.invites.findByTicketSlug(slug);
  if (!invite.ok) return null;
  const party = await c.var.repositories.parties.findById(invite.value.partyId);
  if (!party.ok || !ticketIsLive(invite.value, party.value)) return null;
  return { invite: invite.value, party: party.value };
}

const ticketNotFound = (c: Context<AppEnv>) =>
  c.json({ error: 'ticket_not_found' }, 404, { 'cache-control': 'no-store' });

/**
 * `GET /ticket/:slug` — the ticket a short link names.
 *
 * Public and unauthenticated, like the invite endpoints: the slug is the only
 * credential, so this returns the ticket and the party's card and nothing else
 * — no email, no phone, no payment state. Every way of not finding a live
 * ticket answers the same 404.
 */
// Its own limiter, separate from the invite one and far more generous: a
// ticket page is opened at the door, where a venue's Wi-Fi or a carrier's
// shared address puts dozens of guests behind one IP at once. A guest stuck
// outside because the page was throttled is worse than anything the limiter
// prevents — the slug's 60 bits are what stop enumeration.
tickets.get('/:slug', rateLimit('TICKET_RATE_LIMITER'), async (c) => {
  const found = await liveTicket(c);
  if (!found) return ticketNotFound(c);

  const { invite, party: p } = found;
  const banner = p.document?.photos.banner;
  const dto: TicketLinkDTO = {
    signed: invite.ticketSigned!,
    party: p.name,
    date: p.date,
    cover: p.cover,
    ...(p.venue.time ? { time: p.venue.time } : {}),
    ...(banner ? { banner } : {}),
  };
  // A ticket can be revoked, so no cache may keep serving it afterwards.
  return c.json(dto, 200, { 'cache-control': 'no-store' });
});

/**
 * `GET /ticket/:slug/photos/banner/:token` — the party's banner, behind the
 * ticket itself rather than the invite link, which the host may have closed
 * once the party filled (ADR 0007). Only the banner: the ticket shows nothing
 * else. Cached for a day, so a guest who opened it at home still sees it at a
 * door with no signal; revoking the ticket stops it being served again.
 */
tickets.get(
  '/:slug/photos/banner/:token',
  rateLimit('TICKET_RATE_LIMITER'),
  async (c) => {
    const found = await liveTicket(c);
    if (!found) return ticketNotFound(c);
    return coverPhotoResponse(
      c.env.COVER_PHOTOS,
      c.var.repositories.coverPhotos,
      found.party.id,
      'banner',
      c.req.param('token'),
      'private, max-age=86400',
    );
  },
);

export default tickets;
