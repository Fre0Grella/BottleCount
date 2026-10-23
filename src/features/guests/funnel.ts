import { venueFeeFor, venueFeePerPerson } from '../party/core';
import type { Invite, InviteStatus, Settings } from '../../lib/types';

/**
 * The numbers the Guests tab shows: who was reached, who answered, how full
 * the party is getting and how far the invite travelled. Plain functions of
 * the guest list, so the tab only lays them out.
 */

/** A share of a whole as a width, 0–100. Nothing out of nothing is 0. */
export function percentOf(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.max(0, Math.min(100, (part / whole) * 100));
}

/** The guest list sorted into the funnel's columns and the spread's tiers. */
export function funnelGroups(invites: readonly Invite[]) {
  const confirmed = invites.filter((i) => i.status === 'confirmed');
  return {
    confirmed,
    // Opened the link and stopped there. The funnel's "maybe" column — not
    // people the host invited and is waiting on, but people who looked and
    // did not answer.
    opened: invites.filter((i) => i.status === 'opened'),
    declined: invites.filter((i) => i.status === 'declined'),
    direct: invites.filter((i) => i.depth === 0),
    viral: invites.filter((i) => i.depth > 0),
    checkedIn: confirmed.filter((i) => i.used).length,
    paid: confirmed.filter((i) => i.paidAt).length,
  };
}

/** The funnel bar's segments and marker, as percentages of its length. */
export interface FunnelBar {
  /** Confirmed guests up to the expected headcount (green). */
  within: number;
  /** Confirmed guests past expected but under the cap (accent). */
  over: number;
  /** Still maybe, in whatever room the confirmed guests leave. */
  maybe: number;
  /** Where the expected headcount sits. Only drawn when there is a cap. */
  marker: number;
}

/**
 * The funnel bar for `confirmed` and `opened` guests against the `expected`
 * headcount. With an optional hard `cap` the bar scales to the cap instead,
 * and the guests past expected show as a second segment.
 */
export function funnelBar(
  confirmed: number,
  opened: number,
  expected: number,
  cap: number | null,
): FunnelBar {
  const scale = cap ?? expected;
  const over =
    cap === null ? 0 : Math.max(0, Math.min(confirmed, cap) - expected);
  const used = percentOf(Math.min(confirmed, scale), scale);
  return {
    within: percentOf(Math.min(confirmed, expected), scale),
    over: percentOf(over, scale),
    maybe: Math.max(0, Math.min(percentOf(opened, scale), 100 - used)),
    marker: percentOf(expected, scale),
  };
}

/**
 * How many people the invite reached for each one the host sent it to, as
 * "1.5×". No direct invites yet counts as one, so the factor never divides
 * by zero.
 */
export function spreadFactor(total: number, direct: number): string {
  return (total / Math.max(1, direct)).toFixed(1) + '×';
}

/**
 * What the venue's per-person fee comes to for the guests the host is
 * bringing, or null when the venue charges none.
 *
 * The Plan tab's figure is for the expected count. This one is what the host
 * commits to: on a party guests pay for, everyone marked as paid — a paid
 * guest who then stays home still counts, because the host told the venue a
 * number and pays for it. A free party has no paid marks, so it counts who is
 * coming.
 */
export function venueFeeLine(
  settings: Pick<Settings, 'venue_fee_per_person'>,
  paidParty: boolean,
  coming: number,
  paid: number,
): {
  guests: number;
  who: 'paid' | 'coming';
  fee: number;
  total: number;
} | null {
  const fee = venueFeePerPerson(settings);
  if (fee === 0) return null;
  const guests = paidParty ? paid : coming;
  return {
    guests,
    who: paidParty ? 'paid' : 'coming',
    fee,
    total: venueFeeFor(settings, guests),
  };
}

/** How solid a guest's avatar is in the spread view: faded until they answer. */
export function spreadAvatarOpacity(status: InviteStatus): number {
  if (status === 'confirmed') return 1;
  if (status === 'opened') return 0.55;
  return 0.35;
}

/** The same, for a row of the guest list. */
export function rowAvatarOpacity(status: InviteStatus): number {
  if (status === 'confirmed') return 1;
  if (status === 'opened') return 0.7;
  return 0.45;
}

/** The letter on a guest's avatar. */
export function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/**
 * Someone who opened the link and has not answered has not told anyone who
 * they are — the name only arrives with the answer. They are still a row,
 * because that is what "Reached" and "Maybe" count, so they get a label
 * rather than an empty line.
 */
export function isNameless(inv: Pick<Invite, 'name'>): boolean {
  return inv.name.trim() === '';
}

/** "via Marco" for a guest Marco Bianchi forwarded the invite to. */
export function referrerFirst(referrer: string | null): string {
  if (!referrer) return '';
  return referrer.trim().split(' ')[0];
}
