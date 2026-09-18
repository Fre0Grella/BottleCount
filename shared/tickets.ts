/**
 * Tickets: the code on them, and what their QR carries.
 *
 * Shared because a ticket is issued by one device, printed by another and
 * checked at the door by a third. All three have to agree on the format, and
 * the door has to agree with the server about which invite a code names.
 */

// ── The code ────────────────────────────────────────────────────────────────

/**
 * No I, L, O, U, 0 or 1.
 *
 * These get read off a phone screen in the dark and typed by someone holding a
 * clipboard, so every pair that looks alike in a hurry is gone. U is dropped
 * with V because handwritten they are the same character. Same alphabet
 * FantasyWiki uses for league invitations, for the same reason.
 */
export const TICKET_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * Five characters: 30^5 ≈ 24 million.
 *
 * Only has to be unique *within one party*, so for a party of a few hundred the
 * chance of a collision is negligible — and a unique index plus a redraw makes
 * "negligible" into "handled". Short enough to read aloud across a doorway,
 * which is the whole point of it existing beside the QR.
 */
export const TICKET_CODE_LENGTH = 5;

/**
 * The largest multiple of the alphabet size that fits in a byte. Bytes at or
 * above it are thrown away rather than folded with `%`, which would hand the
 * first few characters a slightly better chance than the rest. Nobody is
 * guessing these — a ticket also needs its guest's name — but an even draw is
 * free here and awkward to retrofit.
 */
const REJECTION_CEILING =
  Math.floor(256 / TICKET_CODE_ALPHABET.length) * TICKET_CODE_ALPHABET.length;

/**
 * A fresh ticket code. Uniqueness is not this function's job — it draws, and
 * the unique index plus a bounded redraw deals with the rare collision.
 */
export function generateTicketCode(): string {
  let code = '';
  while (code.length < TICKET_CODE_LENGTH) {
    // A generous batch, so the common case is one trip to the CSPRNG even after
    // a few rejections.
    const bytes = new Uint8Array(TICKET_CODE_LENGTH * 2);
    crypto.getRandomValues(bytes);
    for (const byte of bytes) {
      if (byte >= REJECTION_CEILING) continue;
      code += TICKET_CODE_ALPHABET[byte % TICKET_CODE_ALPHABET.length];
      if (code.length === TICKET_CODE_LENGTH) break;
    }
  }
  return code;
}

/** How many codes to try before treating collisions as a fault, not bad luck. */
export const TICKET_CODE_ATTEMPTS = 5;

export function isTicketCode(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length === TICKET_CODE_LENGTH &&
    [...value].every((c) => TICKET_CODE_ALPHABET.includes(c))
  );
}

/**
 * What someone typed, as a code.
 *
 * Case and stray spaces or hyphens are forgiven, because those carry no
 * information. Nothing else is: an earlier version folded O onto Q and I onto
 * J, on the theory that door staff mistype. But O and I are *not in the
 * alphabet* — the alphabet was chosen to remove exactly that ambiguity — so
 * guessing what they meant can only turn a correct rejection into the wrong
 * guest being admitted. A code that does not normalise to a valid one is
 * refused, and the door tries again.
 */
export function normaliseTicketCode(input: string): string {
  return input
    .trim()
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .slice(0, TICKET_CODE_LENGTH);
}

// ── The QR payload ──────────────────────────────────────────────────────────

/**
 * What a ticket's QR encodes, signed with the party's key.
 *
 * Keyed on the ticket code rather than an invite id so that scanning and typing
 * resolve the same way: the door does one lookup either way, and a scanner with
 * a broken camera is not a different code path.
 */
export interface TicketQRPayload {
  /** The five-character code, also printed on the ticket. */
  code: string;
  /**
   * The party this ticket is for — its server id on a shared party, or the
   * browser's local id on a free-tier one. Checked so a ticket for last
   * weekend's party cannot be scanned at this one.
   */
  partyId: string;
  guestName: string;
  expiresAt: string;
}

/** Why a ticket was refused. The door needs to tell these apart. */
export type TicketRejection =
  | 'malformed'
  | 'bad_signature'
  | 'wrong_party'
  | 'expired'
  | 'unknown_code'
  | 'name_mismatch'
  | 'not_coming'
  | 'already_used';
