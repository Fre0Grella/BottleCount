/**
 * Tickets: the code on them, and what their QR carries.
 *
 * Shared because a ticket is issued by one device, printed by another and
 * checked at the door by a third. All three have to agree on the format, and
 * the door has to agree with the server about which invite a code names.
 */

import type { PartyDocument } from './collab';
import { isPaidParty } from './payments';
import { randomString } from './random';

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
 * A fresh ticket code, drawn evenly from the alphabet (see `random.ts`).
 * Uniqueness is not this function's job — it draws, and the unique index plus
 * a bounded redraw deals with the rare collision.
 */
export function generateTicketCode(): string {
  return randomString(TICKET_CODE_ALPHABET, TICKET_CODE_LENGTH);
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

function isTicketPayload(value: unknown): value is TicketQRPayload {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p['code'] === 'string' &&
    typeof p['partyId'] === 'string' &&
    typeof p['guestName'] === 'string' &&
    typeof p['expiresAt'] === 'string'
  );
}

// ── The signed string ───────────────────────────────────────────────────────

/**
 * A signed ticket is `<payload>.<signature>`: the payload's JSON in base64, a
 * dot, and the HMAC in base64. That string is what the QR encodes, what a
 * ticket link carries and what the server keeps for a short link, so this is
 * the one place it is written and read.
 *
 * The payload is UTF-8 before it is base64. It used to go straight through
 * `btoa`, which only takes Latin-1, so a guest called Łukasz or 王 had no ticket
 * at all (#18). For a name that is plain ASCII the two encodings are the same
 * bytes, and for a Latin-1 name (Zoë) the reader below still accepts the old
 * one, so no ticket already sent stops working.
 */

/** Far above any real ticket (a few hundred characters), far below abuse. */
const SIGNED_MAX = 2048;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

/** The payload half of a signed ticket. Key order is fixed, as it always was. */
export function encodeTicketPayload(payload: TicketQRPayload): string {
  const json = JSON.stringify({
    code: payload.code,
    partyId: payload.partyId,
    guestName: payload.guestName,
    expiresAt: payload.expiresAt,
  });
  return bytesToBase64(new TextEncoder().encode(json));
}

/**
 * Every way the payload's bytes can be read: as UTF-8 (every ticket from now
 * on) and as Latin-1 (tickets signed before #18). A Latin-1 name is almost
 * never valid UTF-8, so for those only the second reading exists; where both
 * do, the signature decides between them (see `crypto.ts`).
 */
function payloadReadings(bytes: Uint8Array): string[] {
  const latin1 = String.fromCharCode(...bytes);
  try {
    const utf8 = new TextDecoder('utf-8', {
      fatal: true,
      ignoreBOM: false,
    }).decode(bytes);
    return utf8 === latin1 ? [utf8] : [utf8, latin1];
  } catch {
    return [latin1];
  }
}

export interface SignedTicket {
  /** The payload as the guest's page and the server read it. */
  payload: TicketQRPayload;
  /** `payload` first, then a legacy reading the signature may prefer. */
  readings: TicketQRPayload[];
  /** The base64 HMAC. */
  signature: string;
}

/**
 * A signed ticket taken apart, or null when the string is not shaped like
 * one. This checks the shape, not the signature: only the organisers hold the
 * key, so the guest's page and the server can read a ticket but never vouch
 * for it. The door verifies.
 */
export function parseSignedTicket(signed: string): SignedTicket | null {
  if (signed.length > SIGNED_MAX) return null;
  const [payloadB64, signature, extra] = signed.split('.');
  if (!payloadB64 || !signature || extra !== undefined) return null;
  if (!BASE64.test(payloadB64) || !BASE64.test(signature)) return null;

  let readings: TicketQRPayload[];
  try {
    readings = payloadReadings(base64ToBytes(payloadB64))
      .map((json) => JSON.parse(json) as unknown)
      .filter(isTicketPayload);
  } catch {
    return null;
  }
  const [payload] = readings;
  return payload ? { payload, readings, signature } : null;
}

// ── Who has a ticket ────────────────────────────────────────────────────────

/**
 * Where a guest stands with their ticket:
 *
 * - `none` — not coming (or not yet), so there is nothing to make or admit.
 * - `unpaid` — coming, to a party guests pay for, and not yet marked as paid.
 *   On such a party the ticket is what the payment buys, so it is not made,
 *   sent, served by a short link or let through the door until then.
 * - `live` — coming, and paid where paying applies.
 *
 * The one rule the guest list, the door and the server's short links all ask.
 * `paidAt` is null on the server and absent in the browser; both mean unpaid.
 */
export type TicketState = 'none' | 'unpaid' | 'live';

export function ticketState(
  invite: { status: string; paidAt?: string | null },
  party: Pick<PartyDocument, 'settings' | 'payment'> | null | undefined,
): TicketState {
  if (invite.status !== 'confirmed') return 'none';
  if (!invite.paidAt && isPaidParty(party)) return 'unpaid';
  return 'live';
}

/** Why a ticket was refused. The door needs to tell these apart. */
export type TicketRejection =
  | 'malformed'
  | 'bad_signature'
  | 'wrong_party'
  | 'expired'
  | 'unknown_code'
  | 'name_missing'
  | 'name_mismatch'
  | 'not_coming'
  | 'unpaid'
  | 'already_used';
