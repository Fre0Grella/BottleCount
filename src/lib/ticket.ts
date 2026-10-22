import type { TicketQRPayload, TicketRejection } from '../../shared/tickets';
import {
  generateTicketCode,
  isTicketCode,
  normaliseTicketCode,
  TICKET_CODE_ALPHABET,
  TICKET_CODE_ATTEMPTS,
  TICKET_CODE_LENGTH,
  ticketState,
} from '../../shared/tickets';
import type { TicketCheck } from './crypto';
import type { Invite, Party } from './types';

/**
 * A guest's ticket: its code, what its QR carries, how long it lasts, and
 * whether the door lets it in.
 *
 * Pure on purpose — no canvas, no key store, no network — so every rule here
 * runs in a test. Signing is `crypto.ts`, drawing is `drawing.ts`.
 *
 * Guests are named by their invite id, never by their name: two guests can
 * share a name, and a guest can be renamed.
 */

// ── Ticket identity ──────────────────────────────────────────────────────────

/** FNV-1a 32-bit hash — the local-only fallback for a party with no server. */
function fnv1a(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/**
 * How a local party's ticket codes were made before they were stored: hashed
 * from the guest's name and the party's id.
 *
 * A guest typed in now gets a stored, drawn code instead (see
 * `newLocalTicketCode`), because a hashed one changed whenever the guest was
 * renamed. This stays for guests saved before that — their tickets are already
 * out, printed with this code — and `withStoredTicketCodes` stores it for them
 * once, so a rename no longer changes it either.
 */
function legacyCode(party: Party, name: string): string {
  let h = fnv1a(`${name}·${String(party.id)}`);
  let code = '';
  for (let i = 0; i < TICKET_CODE_LENGTH; i++) {
    code += TICKET_CODE_ALPHABET[h % TICKET_CODE_ALPHABET.length];
    h = Math.floor(h / TICKET_CODE_ALPHABET.length) + 7919 * (i + 1);
  }
  return code;
}

/**
 * The code on a guest's ticket. The stored one — the server's on a shared
 * party, the drawn one on a local party — and the legacy hash only for a
 * guest that has none yet.
 */
function codeOf(party: Party, invite: Invite): string {
  return invite.ticketCode || legacyCode(party, invite.name);
}

/** A guest of this party, by invite id. */
export function findInvite(party: Party, inviteId: number): Invite | undefined {
  return party.invites.find((i) => i.id === inviteId);
}

/**
 * The five characters printed on a guest's ticket, or '' for no such guest.
 *
 * The server's, whenever the party has one — that is the code the other phone
 * on the door will look up, and the one door staff read back over a noisy room.
 */
export function ticketCode(party: Party, inviteId: number): string {
  const invite = findInvite(party, inviteId);
  return invite ? codeOf(party, invite) : '';
}

/**
 * A code for a guest typed in on this device, unlike any other in the party.
 *
 * A shared party's guest takes the server's code once their row exists; until
 * then this one stands in.
 */
export function newLocalTicketCode(party: Party): string {
  const taken = new Set(party.invites.map((i) => codeOf(party, i)));
  let code = generateTicketCode();
  for (let i = 1; i < TICKET_CODE_ATTEMPTS && taken.has(code); i++) {
    code = generateTicketCode();
  }
  return code;
}

/**
 * The guest list with a code stored on every local guest that has none, or
 * null when nothing is missing.
 *
 * For guests saved before codes were stored: their code is the legacy hash,
 * the one already on their ticket, written down so that renaming them no
 * longer changes it. Server guests are left alone — their code is the
 * server's, and the next sync would only overwrite anything put here.
 */
export function withStoredTicketCodes(party: Party): Invite[] | null {
  const missing = party.invites.some((i) => !i.remoteId && !i.ticketCode);
  if (!missing) return null;
  return party.invites.map((i) =>
    !i.remoteId && !i.ticketCode
      ? { ...i, ticketCode: legacyCode(party, i.name) }
      : i,
  );
}

/**
 * The party id a ticket is stamped with.
 *
 * The server's on a shared party, so a ticket issued on one device resolves on
 * another. Falls back to the browser's local id, which is all a local-only
 * party has.
 */
function ticketPartyId(party: Party): string {
  return party.publication?.remoteId ?? String(party.id);
}

// ── Expiry ───────────────────────────────────────────────────────────────────

/** A ticket lasts until 06:00 the morning after the party, local time. */
export function ticketExpiry(party: Pick<Party, 'date'>): Date {
  const exp = new Date(`${party.date}T06:00:00`);
  exp.setDate(exp.getDate() + 1);
  return exp;
}

/** `15 Nov 06:00` — the expiry the ticket shows. */
export function ticketExpiryLabel(party: Pick<Party, 'date'>): string {
  const exp = ticketExpiry(party);
  const day = exp.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
  const time = exp.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${day} ${time}`;
}

/** The signed-QR payload for a guest's ticket, or null for no such guest. */
export function ticketPayload(
  party: Party,
  inviteId: number,
): TicketQRPayload | null {
  const invite = findInvite(party, inviteId);
  if (!invite) return null;
  return {
    code: codeOf(party, invite),
    partyId: ticketPartyId(party),
    guestName: invite.name,
    expiresAt: ticketExpiry(party).toISOString(),
  };
}

// ── The door ─────────────────────────────────────────────────────────────────

/**
 * What the door was shown: a scanned QR, already checked against the party's
 * key (`verifyTicket`), or a code and name typed by hand.
 */
export type DoorEntry =
  | { kind: 'scan'; check: TicketCheck }
  | { kind: 'typed'; code: string; name: string };

export type DoorVerdict =
  | { ok: true; invite: Invite }
  | {
      ok: false;
      reason: TicketRejection;
      /** The guest the ticket resolved to, when it got that far. */
      invite?: Invite;
      /** The name a scanned ticket carries, for a ticket that resolved to no one. */
      guestName?: string;
    };

/**
 * Whether a ticket gets its guest in, or why not.
 *
 * The camera and the typed code are the same question asked two ways, so they
 * end in the same rules — a scanner with a dead camera should not take a
 * different route through them than one that works. Checking the guest in
 * (and losing the race to the other phone on the door) is the caller's.
 */
export function checkTicket(
  party: Party,
  entry: DoorEntry,
  now: number = Date.now(),
): DoorVerdict {
  const byCode = (code: string) =>
    party.invites.find((i) => codeOf(party, i) === code);

  if (entry.kind === 'scan') {
    const { check } = entry;
    if (!check.ok) return { ok: false, reason: check.reason };
    const { payload } = check;
    const guestName = payload.guestName;
    if (payload.partyId !== ticketPartyId(party)) {
      return { ok: false, reason: 'wrong_party', guestName };
    }
    if (new Date(payload.expiresAt).getTime() < now) {
      return { ok: false, reason: 'expired', guestName };
    }
    // By name too: a guest typed in on a shared party may have been sent a
    // ticket before the server's code replaced the stand-in. The signature
    // already proves the ticket is ours.
    const invite =
      byCode(payload.code) ??
      party.invites.find((i) => i.name === payload.guestName);
    return admit(party, invite, guestName);
  }

  // Typed. The code alone is not enough: five characters are short, and a
  // guest who over-hears another's could walk in on it. Requiring the name as
  // well means the person at the door checks something the code does not
  // carry.
  const code = normaliseTicketCode(entry.code);
  const name = entry.name.trim();
  if (!isTicketCode(code)) return { ok: false, reason: 'malformed' };
  if (!name) return { ok: false, reason: 'name_missing' };

  const invite = byCode(code);
  if (!invite) return { ok: false, reason: 'unknown_code' };
  if (invite.name.trim().toLowerCase() !== name.toLowerCase()) {
    // Not `invite`: naming the guest the code belongs to would hand a
    // stranger a real guest's name.
    return { ok: false, reason: 'name_mismatch' };
  }
  return admit(party, invite, name);
}

function admit(
  party: Party,
  invite: Invite | undefined,
  guestName: string,
): DoorVerdict {
  if (!invite) return { ok: false, reason: 'unknown_code', guestName };
  // Their code exists from the moment they opened the link, so on a paid party
  // the code alone is not a ticket. Someone paying at the door can be marked
  // paid in the guest list and checked again.
  switch (ticketState(invite, party)) {
    case 'none':
      return { ok: false, reason: 'not_coming', invite };
    case 'unpaid':
      return { ok: false, reason: 'unpaid', invite };
    case 'live':
      return invite.used
        ? { ok: false, reason: 'already_used', invite }
        : { ok: true, invite };
  }
}
