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

/** Lowercase, and without the letters people misread for digits (i, l, o, u). */
export const TICKET_SLUG_ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
export const TICKET_SLUG_LENGTH = 12;

const SLUG_PATTERN = new RegExp(
  `^[${TICKET_SLUG_ALPHABET}]{${TICKET_SLUG_LENGTH}}$`,
);

export function isTicketSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/** A fresh slug from the platform's CSPRNG. 32 divides 256, so no bias. */
export function newTicketSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(TICKET_SLUG_LENGTH));
  return Array.from(
    bytes,
    (b) => TICKET_SLUG_ALPHABET[b % TICKET_SLUG_ALPHABET.length],
  ).join('');
}

/** Far above any real ticket (a few hundred characters), far below abuse. */
const SIGNED_MAX = 2048;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

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
  if (signed.length > SIGNED_MAX) return null;
  const [payloadB64, signature, extra] = signed.split('.');
  if (!payloadB64 || !signature || extra !== undefined) return null;
  if (!BASE64.test(payloadB64) || !BASE64.test(signature)) return null;

  try {
    const payload = JSON.parse(atob(payloadB64)) as Record<string, unknown>;
    return typeof payload['code'] === 'string' ? payload['code'] : null;
  } catch {
    return null;
  }
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
}
