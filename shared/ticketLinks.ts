/**
 * Short ticket links (`/t/<slug>`), shared by the Worker and the frontend.
 *
 * A ticket used to travel whole inside its link's fragment — the signed QR
 * string plus the party's name and date — which made links long enough to look
 * like spam in a chat. A short link instead names a ticket the server keeps,
 * and the ticket page fetches it.
 *
 * That makes the slug the credential: whoever has the link can show the QR at
 * the door. So it is random and long enough not to be guessed — 12 characters
 * of a 32-letter alphabet is 60 bits — rather than the four characters a URL
 * shortener would use. A four-character slug could be enumerated in an
 * afternoon, and every hit would be someone else's ticket.
 */

import { parseSignedTicket } from './tickets';

/** Lowercase, and without the letters people misread for digits (i, l, o, u). */
export const TICKET_SLUG_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
export const TICKET_SLUG_LENGTH = 12;

const SLUG_PATTERN = new RegExp(
  `^[${TICKET_SLUG_ALPHABET}]{${TICKET_SLUG_LENGTH}}$`,
);

export function isTicketSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/**
 * The ticket code inside a signed QR string (`<payload>.<HMAC>`), or null when
 * the string is not shaped like one.
 *
 * This checks the shape, not the signature: the door verifies the signature
 * with the party's key, as it always has. The server only needs to know the
 * string is a ticket, and whose — so an organiser's request cannot pin one
 * guest's ticket to another guest's link.
 */
export function signedTicketCode(signed: string): string | null {
  return parseSignedTicket(signed)?.payload.code ?? null;
}

/** What `GET /ticket/:slug` answers with. */
export interface TicketLinkDTO {
  /** Exactly the string the organiser signed: what the QR encodes. */
  signed: string;
  /** Read from the party as it is now, so a renamed party shows its new name. */
  party: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  cover: number;
  time?: string;
  /**
   * The party's banner photo token, when it has one. Fetched from
   * `/ticket/<slug>/photos/banner/<token>`, which serves while the ticket is
   * live.
   */
  banner?: string;
}
