import { state } from '../../store/storeState';
import { formatClockTime } from '../../lib/dates';
import type { DoorEntry, DoorVerdict } from './ticket';
import type { Party } from '../../lib/types';

/**
 * Door mode: what the scanner says about a ticket, the tally at the top, and
 * the short list of who just came in.
 *
 * Whether a ticket gets its guest in is `checkTicket` (ticket.ts); this file
 * is what the door screen does with the answer.
 */

/** A verdict on screen: the guest (or the problem) and a line under it. */
interface ScanResult {
  ok: boolean;
  name: string;
  sub?: string;
}

/** How long a verdict stays up before the door is ready for the next guest. */
const SCAN_RESULT_MS = 2000;
/** Check-ins kept for the "Recent check-ins" list. */
const HISTORY_KEPT = 6;

// ── Rules ──────────────────────────────────────────────────────────────────

/** What the door screen says for each way a ticket is refused. */
export function rejection(
  entry: DoorEntry,
  verdict: Extract<DoorVerdict, { ok: false }>,
): { name: string; sub: string } {
  const who = verdict.invite?.name ?? (verdict.guestName || 'Unknown guest');
  switch (verdict.reason) {
    case 'malformed':
      return entry.kind === 'scan'
        ? {
            name: 'Forged or invalid ticket',
            sub: "That QR isn't a BottleCount ticket",
          }
        : {
            name: 'Invalid code',
            sub: 'A ticket code is five letters and numbers',
          };
    case 'bad_signature':
      return {
        name: 'Forged or invalid ticket',
        sub: 'Signature check failed — this ticket may be counterfeit',
      };
    case 'wrong_party':
      return { name: who, sub: 'Ticket is for another party' };
    case 'expired':
      return { name: who, sub: 'This ticket has expired' };
    case 'unknown_code':
      return entry.kind === 'scan'
        ? { name: who, sub: 'Not found on the confirmed guest list' }
        : {
            name: 'Unknown code',
            sub: 'No ticket on this party has that code',
          };
    case 'name_missing':
      return {
        name: 'Name needed',
        sub: "Type the guest's name as well as the code",
      };
    case 'name_mismatch':
      // Without naming them — that would hand a stranger a real guest's name.
      return {
        name: 'Name does not match',
        sub: 'That code belongs to a different guest',
      };
    case 'not_coming':
      return { name: who, sub: "They haven't confirmed they're coming" };
    case 'unpaid':
      return {
        name: who,
        sub: "Hasn't paid yet — mark them paid, then check again",
      };
    case 'already_used':
      return {
        name: who,
        sub: `Already scanned at ${formatClockTime(verdict.invite?.usedAt) || '?'} — do not let in again`,
      };
  }
}

/** The door's tally: confirmed guests, and how many of them are inside. */
export function doorTally(party: Party | null | undefined): {
  inside: number;
  confirmed: number;
} {
  const confirmed = (party?.invites ?? []).filter(
    (i) => i.status === 'confirmed',
  );
  return {
    inside: confirmed.filter((i) => i.used).length,
    confirmed: confirmed.length,
  };
}

// ── Actions ────────────────────────────────────────────────────────────────

let clearTimer: ReturnType<typeof setTimeout> | null = null;

/** Puts a verdict on the door screen, and takes it down after a moment. */
export function showScanResult(result: ScanResult): void {
  state.scanResult = result;
  if (clearTimer !== null) clearTimeout(clearTimer);
  clearTimer = setTimeout(() => {
    state.scanResult = null;
    clearTimer = null;
  }, SCAN_RESULT_MS);
}

/** Adds a guest who just came in to the top of the recent check-ins. */
export function recordCheckIn(name: string, time: string): void {
  state.scanHistory = [{ name, time }, ...state.scanHistory].slice(
    0,
    HISTORY_KEPT,
  );
}
