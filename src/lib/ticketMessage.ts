import { signTicket } from './crypto';
import { ticketPayload } from './ticket';
import { ticketUrl } from './ticketLink';
import type { Invite, Party } from './types';

/**
 * What a guest is sent with their ticket, and where it goes.
 *
 * Shared by the Send sheet and by "Mark paid", which opens WhatsApp or the mail
 * app straight away when the guest left only one way to reach them — so both
 * send the same words and the same link.
 */

/** `14 Nov` — short enough for a WhatsApp preview line. */
export function partyDateShort(date: string): string {
  return new Date(date).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

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
  return `🎫 ${guestName}, you're on the list for ${party.name} (${partyDateShort(party.date)}). Your ticket — show the QR at the door: ${link}`;
}

export function ticketEmailSubject(
  party: Pick<Party, 'name'> | null | undefined,
): string {
  return `Your ticket — ${party?.name ?? 'the party'}`;
}

/** Signs the guest's ticket and builds the link to their ticket page. */
export async function signedTicketLink(
  party: Party,
  guestName: string,
): Promise<string> {
  const signed = await signTicket(party, ticketPayload(party, guestName));
  return ticketUrl(
    window.location.origin,
    import.meta.env.BASE_URL as string,
    signed,
    {
      party: party.name,
      date: party.date,
      cover: party.cover,
      time: party.venue.time,
    },
  );
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
