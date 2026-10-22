import { describe, expect, it } from 'vitest';
import { calculate, planFor, runsBar, venueFeeFor } from './core';
import type { Catalog, Settings } from '../../lib/types';

const catalog: Catalog = {
  ingredients: {
    Vodka: {
      type: 'spirit',
      abv: 0.4,
      volume_ml: 700,
      price_min: 10,
      price_max: 14,
    },
    'Chips 150g': {
      type: 'snack',
      abv: 0,
      volume_ml: 0,
      price_min: 1.39,
      price_max: 1.39,
      unit: 'pcs',
    },
    Cups: {
      type: 'extra',
      abv: 0,
      volume_ml: 0,
      price_min: 0.1,
      price_max: 0.1,
      unit: 'pcs',
    },
  },
  cocktails: {},
} as unknown as Catalog;

function settings(): Settings {
  return {
    guests: 40,
    ticket_price: 15,
    venue_cost: 200,
    equipment_cost: 100,
    alcohol_ml_per_person: 50,
    buffer: 1.1,
    extras: {
      'Chips 150g': { qty_per_person: 0.055 },
      Cups: { qty_per_person: 2 },
    },
    menu: { Beer: { macro_pct: 1, spirits: { Vodka: { pct: 1 } } } },
  };
}

describe('runsBar', () => {
  it('is true for a party saved before the switch existed', () => {
    expect(runsBar({})).toBe(true);
  });

  it('is false only when the venue runs the bar', () => {
    expect(runsBar({ barManaged: false })).toBe(false);
    expect(runsBar({ barManaged: true })).toBe(true);
  });
});

describe('planFor', () => {
  it('leaves the plan alone when the host runs the bar', () => {
    const s = settings();
    expect(planFor(s, true)).toBe(s);
  });

  it('plans nothing to buy when the venue runs the bar', () => {
    const r = calculate(planFor(settings(), false), catalog);

    expect(r.shopping_list).toEqual([]);
    expect(r.total_min).toBe(0);
    expect(r.total_max).toBe(0);
  });

  it('leaves snacks off the shopping list too', () => {
    // Decided on #9: a venue that runs the bar handles the snacks as well.
    const on = calculate(planFor(settings(), true), catalog);
    const off = calculate(planFor(settings(), false), catalog);

    expect(on.shopping_list.some((i) => i.type === 'snack')).toBe(true);
    expect(off.shopping_list.some((i) => i.type === 'snack')).toBe(false);
  });

  it('still counts the fixed costs and ticket revenue', () => {
    const r = calculate(planFor(settings(), false), catalog);

    expect(r.fixed_costs).toBe(300);
    expect(r.revenue).toBe(600);
    expect(r.profit_min).toBe(300);
    // With no drinks per head, break-even is fixed costs over the ticket price.
    expect(r.break_even).toBe(20);
  });

  it('keeps the menu, so switching back restores it', () => {
    const s = settings();
    planFor(s, false);

    expect(s.menu).toEqual(settings().menu);
    expect(s.extras).toEqual(settings().extras);
  });

  it('plans drinks again once the host runs the bar', () => {
    const r = calculate(planFor(settings(), true), catalog);
    expect(r.shopping_list.length).toBeGreaterThan(0);
  });
});

describe('a venue fee per person', () => {
  // The venue runs the bar here, so there are no drinks to buy and the numbers
  // below are only tickets, fixed costs and the fee: 40 guests at €15, €300
  // fixed, €8 a head.
  function withFee(fee: number): Settings {
    return planFor({ ...settings(), venue_fee_per_person: fee }, false);
  }

  it('costs the fee for every expected guest', () => {
    const r = calculate(withFee(8), catalog);

    expect(r.venue_fees).toBe(320);
    expect(r.fixed_costs).toBe(300);
    expect(r.profit_min).toBe(600 - 300 - 320);
  });

  it('counts against each ticket, not against the fixed costs, for break-even', () => {
    // Each guest brings €15 and costs €8, so €7 a head pays off €300.
    expect(calculate(withFee(8), catalog).break_even).toBe(43);
  });

  it('never breaks even when the fee is the whole ticket', () => {
    expect(calculate(withFee(15), catalog).break_even).toBeNull();
  });

  it('changes nothing for a party saved before the fee existed', () => {
    const r = calculate(planFor(settings(), false), catalog);

    expect(r.venue_fees).toBe(0);
    expect(r.profit_min).toBe(300);
    expect(r.break_even).toBe(20);
  });
});

describe('venueFeeFor', () => {
  it('is the fee times the guests counted', () => {
    expect(venueFeeFor({ venue_fee_per_person: 8 }, 12)).toBe(96);
  });

  it('is nothing without a fee', () => {
    expect(venueFeeFor({}, 12)).toBe(0);
  });
});
