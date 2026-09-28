import { describe, expect, it } from 'vitest';
import { calculate, planFor, runsBar } from './core';
import type { Catalog, Settings } from './types';

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
