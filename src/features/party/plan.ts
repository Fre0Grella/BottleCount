import { formatEuro, formatEuroRange } from '../../lib/display';
import type { IconName } from '../../lib/icons';
import type { CalculationResult, Party, Settings } from '../../lib/types';
import { runsBar } from './core';

/**
 * The Plan tab's rules: how many guests a party may have, what a typed-in
 * number becomes, and the money summaries the tab and the KPI bar show.
 *
 * Plain functions of a party; the edits that apply them are in planEdits.ts.
 */

// ── Headcount ──────────────────────────────────────────────────────────────

/** The most guests the planner offers, for the expected count and the cap. */
export const MAX_GUESTS = 600;

/** A headcount the planner accepts: a whole number from 1 to MAX_GUESTS. */
export function clampHeadcount(n: number): number {
  return Math.max(1, Math.min(MAX_GUESTS, Math.round(n)));
}

/**
 * The expected guests from what was typed, or null to leave them as they are:
 * an empty or half-typed field must not snap the count to 1 mid-edit.
 */
export function guestsFromInput(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 1 ? clampHeadcount(n) : null;
}

/** The headcount cap from what was typed, or null for something not a number. */
export function capFromInput(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) ? clampHeadcount(n) : null;
}

/** Where the cap starts when it is switched on: a little above the guests. */
export function defaultCap(guests: number): number {
  return Math.min(MAX_GUESTS, Math.max(guests + 1, Math.round(guests * 1.25)));
}

// ── Drinks ─────────────────────────────────────────────────────────────────

/**
 * Roughly how many standard drinks the per-person alcohol comes to. A rough
 * figure for the hint under the presets: one per 14 ml.
 */
export function stdDrinks(mlPerPerson: number): number {
  return Math.round(mlPerPerson / 14);
}

// ── Money ──────────────────────────────────────────────────────────────────

/** The money fields the Plan tab edits. */
export type CostKey =
  | 'ticket_price'
  | 'venue_cost'
  | 'venue_fee_per_person'
  | 'equipment_cost';

/**
 * An amount from what was typed: anything not a number is 0. The per-guest
 * venue fee is never negative; the others are taken as typed.
 */
export function amountFromInput(key: CostKey, raw: string): number {
  const n = Number(raw) || 0;
  return key === 'venue_fee_per_person' ? Math.max(0, n) : n;
}

/** A line of the "If everyone comes" summary. */
export interface PnlRow {
  label: string;
  amount: number;
  /** revenue and cost lines, then the profit at the bottom. */
  kind: 'revenue' | 'cost' | 'profit';
}

/**
 * The "If everyone comes" summary: revenue, what it costs, the profit. Drinks
 * drop out when the venue runs the bar, the venue fee when there is none.
 */
export function pnlRows(
  r: CalculationResult,
  settings: Pick<Settings, 'guests' | 'venue_fee_per_person'>,
  planningDrinks: boolean,
): PnlRow[] {
  const rows: PnlRow[] = [
    { label: 'Ticket revenue', amount: r.revenue, kind: 'revenue' },
  ];
  if (planningDrinks) {
    rows.push({
      label: 'Drinks',
      amount: (r.total_min + r.total_max) / 2,
      kind: 'cost',
    });
  }
  rows.push({ label: 'Fixed costs', amount: r.fixed_costs, kind: 'cost' });
  if (r.venue_fees > 0) {
    rows.push({
      label: `Venue fee (${settings.guests} × €${settings.venue_fee_per_person ?? 0})`,
      amount: r.venue_fees,
      kind: 'cost',
    });
  }
  rows.push({
    label: 'Net profit',
    amount: (r.profit_min + r.profit_max) / 2,
    kind: 'profit',
  });
  return rows;
}

/** One figure of the KPI bar over the party tabs. */
export interface Kpi {
  label: string;
  icon: IconName;
  value: string;
  sub: string;
  /** good and bad colour the value; plain leaves it in the text colour. */
  tone: 'plain' | 'good' | 'bad';
}

/** A euro range, or one figure when its ends are within a euro. */
function euroSpan(a: number, b: number): string {
  return Math.abs(a - b) < 1 ? formatEuro(a) : formatEuroRange(a, b);
}

/** Spend, revenue, profit and break-even for the KPI bar. */
export function partyKpis(
  p: Pick<Party, 'barManaged' | 'settings'>,
  r: CalculationResult,
): Kpi[] {
  const { guests, ticket_price } = p.settings;
  const beCovered = r.break_even !== null && guests >= r.break_even;
  const avgProfit = (r.profit_min + r.profit_max) / 2;

  // With the venue running the bar there is no drink spend, and "€0" would
  // read as a mistake — what the host does spend is the venue: its fixed costs
  // and, usually in this case, a fee per head.
  const spend = runsBar(p)
    ? {
        value: euroSpan(Math.round(r.total_min), Math.round(r.total_max)),
        sub:
          formatEuro((r.total_min + r.total_max) / 2 / (guests || 1)) +
          ' / guest',
      }
    : {
        value: formatEuro(r.fixed_costs + r.venue_fees),
        sub: 'venue + equipment',
      };

  return [
    { label: 'Spend', icon: 'cart', ...spend, tone: 'plain' },
    {
      label: 'Revenue',
      icon: 'euro',
      value: formatEuro(r.revenue),
      sub: guests + ' × €' + ticket_price,
      tone: 'plain',
    },
    {
      label: 'Profit',
      icon: 'trend',
      value: formatEuro(avgProfit),
      sub: euroSpan(Math.round(r.profit_min), Math.round(r.profit_max)),
      tone: avgProfit >= 0 ? 'good' : 'bad',
    },
    {
      label: 'Break-even',
      icon: 'target',
      value: r.break_even === null ? 'never' : r.break_even + ' ppl',
      sub:
        r.break_even === null
          ? 'ticket < cost'
          : beCovered
            ? 'covered'
            : r.break_even - guests + ' more',
      tone: r.break_even === null ? 'bad' : beCovered ? 'good' : 'plain',
    },
  ];
}
