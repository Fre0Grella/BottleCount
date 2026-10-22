import { signTicket } from './crypto';
import { shortDate } from './dates';
import { findInvite, ticketPayload } from './ticket';
import { storeTicketLink } from './api/tickets';
import { shortTicketUrl, ticketUrl } from '../../shared/urls';
import type { Invite, Party } from './types';

/**
 * What a guest is sent with their ticket, and where it goes.
 *
 * Shared by the Send sheet and by "Mark paid", which opens WhatsApp or the mail
 * app straight away when the guest left only one way to reach them — so both
 * send the same words and the same link.
 */

/**
 * The words sent with the ticket. Every channel sends the link — never the
 * ticket image — so a guest gets the same thing however it reached them: a page
 * with their name, their code and a QR the door scans.
 */
export function ticketMessage(
  party: Pick<Party, 'name' | 'date'>,
  guestName: string,
  link: string,
): string {
  return `🎫 ${guestName}, you're on the list for ${party.name} (${shortDate(party.date)}). Your ticket — show the QR at the door: ${link}`;
}

export function ticketEmailSubject(
  party: Pick<Party, 'name'> | null | undefined,
): string {
  return `Your ticket — ${party?.name ?? 'the party'}`;
}

/**
 * Signs the guest's ticket and builds the link to their ticket page.
 *
 * On a shared party that is a short link (`/t/<slug>`, #41): the server keeps
 * the signed ticket and the page fetches it. A local-only party has no server,
 * and a hand-typed guest may not have their server row yet, so either gets the
 * long link with the ticket in its fragment — as does any failure to store it,
 * since a long link that works beats no link at all.
 */
export async function signedTicketLink(
  party: Party,
  inviteId: number,
): Promise<string> {
  const payload = ticketPayload(party, inviteId);
  if (!payload) throw new Error('no such guest');
  const signed = await signTicket(party, payload);
  const origin = window.location.origin;
  const base = import.meta.env.BASE_URL as string;

  const partyRemoteId = party.publication?.remoteId;
  const invite = findInvite(party, inviteId);
  if (partyRemoteId && invite?.remoteId) {
    const stored = await storeTicketLink(
      partyRemoteId,
      invite.remoteId,
      signed,
    );
    if (stored.ok && stored.value) {
      return shortTicketUrl(origin, base, stored.value);
    }
  }

  return ticketUrl(origin, base, signed, {
    party: party.name,
    date: party.date,
    cover: party.cover,
    time: party.venue.time,
  });
}

/** How a ticket goes out once a guest is marked as paid. */
export type SendRoute = 'sheet' | 'whatsapp' | 'email';

/**
 * Straight to the one app when the guest left only one way to reach them;
 * the Send sheet when there is a choice to make (both) or nowhere to send yet
 * (neither), since the sheet is also where a contact gets added.
 */
export function sendRoute(guest: Pick<Invite, 'email' | 'phone'>): SendRoute {
  const hasEmail = !!guest.email;
  const hasPhone = !!guest.phone;
  if (hasPhone && !hasEmail) return 'whatsapp';
  if (hasEmail && !hasPhone) return 'email';
  return 'sheet';
}
