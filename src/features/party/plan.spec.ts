import { describe, expect, it } from 'vitest';
import {
  MAX_GUESTS,
  amountFromInput,
  capFromInput,
  clampHeadcount,
  defaultCap,
  guestsFromInput,
  partyKpis,
  pnlRows,
  stdDrinks,
} from './plan';
import type { CalculationResult, Party } from '../../lib/types';

function result(over: Partial<CalculationResult> = {}): CalculationResult {
  return {
    shopping_list: [],
    total_min: 300,
    total_max: 340,
    fixed_costs: 250,
    venue_fees: 0,
    revenue: 600,
    profit_min: 10,
    profit_max: 50,
    break_even: 38,
    ...over,
  };
}

function party(
  over: Partial<Party['settings']> = {},
  barManaged = true,
): Pick<Party, 'barManaged' | 'settings'> {
  return {
    barManaged,
    settings: {
      guests: 40,
      ticket_price: 15,
      venue_cost: 200,
      equipment_cost: 50,
      alcohol_ml_per_person: 75,
      buffer: 1.1,
      max_capacity: null,
      ...over,
    },
  };
}

describe('headcount', () => {
  it('holds a count to whole guests from 1 to the cap', () => {
    expect(clampHeadcount(0)).toBe(1);
    expect(clampHeadcount(41.6)).toBe(42);
    expect(clampHeadcount(10_000)).toBe(MAX_GUESTS);
  });

  it('leaves the guests alone while the field is empty or below one', () => {
    expect(guestsFromInput('')).toBeNull();
    expect(guestsFromInput('0.5')).toBeNull();
    expect(guestsFromInput('abc')).toBeNull();
    expect(guestsFromInput('55')).toBe(55);
    expect(guestsFromInput('9999')).toBe(MAX_GUESTS);
  });

  it('takes any number as a cap, held to the bounds', () => {
    expect(capFromInput('abc')).toBeNull();
    expect(capFromInput('')).toBe(1);
    expect(capFromInput('80')).toBe(80);
    expect(capFromInput('700')).toBe(MAX_GUESTS);
  });

  it('starts the cap a quarter above the guests, at least one more', () => {
    expect(defaultCap(40)).toBe(50);
    expect(defaultCap(2)).toBe(3);
    expect(defaultCap(590)).toBe(MAX_GUESTS);
  });
});

describe('stdDrinks', () => {
  it('is one standard drink per 14 ml', () => {
    expect(stdDrinks(75)).toBe(5);
    expect(stdDrinks(100)).toBe(7);
  });
});

describe('amountFromInput', () => {
  it('reads anything not a number as 0', () => {
    expect(amountFromInput('ticket_price', '')).toBe(0);
    expect(amountFromInput('venue_cost', '12x')).toBe(0);
    expect(amountFromInput('equipment_cost', '80')).toBe(80);
  });

  it('never lets the per-guest venue fee go negative', () => {
    expect(amountFromInput('venue_fee_per_person', '-5')).toBe(0);
    expect(amountFromInput('venue_fee_per_person', '4.5')).toBe(4.5);
    expect(amountFromInput('ticket_price', '-5')).toBe(-5);
  });
});

describe('pnlRows', () => {
  const labels = (rows: { label: string }[]) => rows.map((r) => r.label);

  it('is revenue, drinks, fixed costs and the profit when the host runs the bar', () => {
    const rows = pnlRows(result(), party().settings, true);
    expect(labels(rows)).toEqual([
      'Ticket revenue',
      'Drinks',
      'Fixed costs',
      'Net profit',
    ]);
    expect(rows[1]).toEqual({ label: 'Drinks', amount: 320, kind: 'cost' });
    expect(rows[3]).toEqual({
      label: 'Net profit',
      amount: 30,
      kind: 'profit',
    });
  });

  it('drops the drinks when the venue runs the bar, and shows its fee', () => {
    const rows = pnlRows(
      result({ venue_fees: 200 }),
      party({ venue_fee_per_person: 5 }).settings,
      false,
    );
    expect(labels(rows)).toEqual([
      'Ticket revenue',
      'Fixed costs',
      'Venue fee (40 × €5)',
      'Net profit',
    ]);
  });
});

describe('partyKpis', () => {
  it('shows the drink spend per guest when the host runs the bar', () => {
    const [spend, revenue, profit, be] = partyKpis(party(), result());
    expect(spend).toMatchObject({ label: 'Spend', sub: '€8 / guest' });
    expect(revenue.sub).toBe('40 × €15');
    expect(profit.tone).toBe('good');
    expect(be).toMatchObject({ value: '38 ppl', sub: 'covered', tone: 'good' });
  });

  it('shows the venue as the spend when the venue runs the bar', () => {
    const [spend] = partyKpis(
      party({}, false),
      result({ fixed_costs: 250, venue_fees: 200 }),
    );
    expect(spend).toMatchObject({ sub: 'venue + equipment' });
    expect(spend.value).toBe(
      partyKpis(party({}, false), result({ fixed_costs: 450 }))[0].value,
    );
  });

  it('says how many more guests break even, or that it never does', () => {
    const short = partyKpis(party(), result({ break_even: 50 }))[3];
    expect(short).toMatchObject({ sub: '10 more', tone: 'plain' });
    const never = partyKpis(
      party(),
      result({ break_even: null, profit_min: -90, profit_max: -10 }),
    );
    expect(never[2].tone).toBe('bad');
    expect(never[3]).toMatchObject({
      value: 'never',
      sub: 'ticket < cost',
      tone: 'bad',
    });
  });
});
