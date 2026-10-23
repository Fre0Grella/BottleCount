import { describe, expect, it } from 'vitest';
import {
  builderFromCocktail,
  cocktailFromBuilder,
  cocktailsForSpirit,
  emptyBuilder,
  mixerMeasure,
  mixerQtyLabel,
  roundQty,
  servingOf,
  toggleQty,
} from './cocktailBuilder';
import type { Catalog } from '../../lib/types';

const ing = (type: string, abv = 0, unit?: string) =>
  ({
    type,
    abv,
    price_min: 1,
    price_max: 1,
    unit,
  }) as Catalog['ingredients'][string];

const catalog: Catalog = {
  ingredients: {
    'Gin 70cl': ing('spirit', 0.4),
    'Vodka 70cl': ing('spirit', 0.4),
    'Tonic Water 1L': ing('mixer'),
    'Ice kg': ing('extra', 0, 'kg'),
  },
  cocktails: {
    'Gin Tonic': {
      main_spirit: 'Gin 70cl',
      recipe: {
        'Gin 70cl': { quantity: 40 },
        'Tonic Water 1L': { quantity: 120 },
        'Ice kg': { quantity: 0.15 },
      },
    },
    'Gin Lemon': {
      main_spirit: 'Gin 70cl',
      recipe: { 'Gin 70cl': { quantity: 50 } },
    },
    'Zed Mix': {
      main_spirit: 'Gin 70cl',
      custom: true,
      recipe: { 'Gin 70cl': { quantity: 30 }, 'Vodka 70cl': { quantity: 20 } },
    },
    'Vodka Lemon': {
      main_spirit: 'Vodka 70cl',
      recipe: { 'Vodka 70cl': { quantity: 50 } },
    },
  },
};

describe('mixer measures', () => {
  it('steps by weight or by volume', () => {
    expect(mixerMeasure(true)).toEqual({ step: 0.05, unit: 'kg', start: 0.1 });
    expect(mixerMeasure(false)).toEqual({ step: 25, unit: 'ml', start: 100 });
  });
  it('labels kg with two decimals', () => {
    expect(mixerQtyLabel(0.1, true)).toBe('0.10 kg');
    expect(mixerQtyLabel(100, false)).toBe('100 ml');
  });
  it('rounds away float noise and stops at 0', () => {
    expect(roundQty(0.1 + 0.05)).toBe(0.15);
    expect(roundQty(-25)).toBe(0);
  });
});

describe('toggleQty', () => {
  it('ticks on at the start quantity and off again', () => {
    const on = toggleQty({}, 'Vodka 70cl', 30);
    expect(on).toEqual({ 'Vodka 70cl': 30 });
    expect(toggleQty(on, 'Vodka 70cl', 30)).toEqual({});
  });
});

describe('builder <-> cocktail', () => {
  it('splits a recipe into the base, spirits and mixers', () => {
    expect(builderFromCocktail(catalog, 'Zed Mix', 'Gin 70cl')).toEqual({
      editKey: 'Zed Mix',
      name: 'Zed Mix',
      mainQty: 30,
      spirits: { 'Vodka 70cl': 20 },
      mixers: {},
    });
    expect(
      builderFromCocktail(catalog, 'Gin Tonic', 'Gin 70cl')?.mixers,
    ).toEqual({
      'Tonic Water 1L': 120,
      'Ice kg': 0.15,
    });
    expect(builderFromCocktail(catalog, 'Nope', 'Gin 70cl')).toBeNull();
  });
  it('builds the recipe back, base first', () => {
    const b = builderFromCocktail(catalog, 'Gin Tonic', 'Gin 70cl')!;
    expect(cocktailFromBuilder(b, 'Gin 70cl', 'Spirits')).toEqual({
      main_spirit: 'Gin 70cl',
      category: 'Spirits',
      recipe: catalog.cocktails['Gin Tonic'].recipe,
    });
  });
  it('starts empty at a 50 ml pour', () => {
    expect(emptyBuilder()).toEqual({
      editKey: null,
      name: '',
      mainQty: 50,
      spirits: {},
      mixers: {},
    });
  });
});

describe('servingOf', () => {
  it('adds volumes but not weights, and averages the strength', () => {
    const b = builderFromCocktail(catalog, 'Gin Tonic', 'Gin 70cl')!;
    // 40 ml gin at 40% in 160 ml -> 10%.
    expect(servingOf(catalog, b, 'Gin 70cl')).toEqual({ ml: 160, abvPct: 10 });
  });
  it('counts an unknown base spirit as 40%', () => {
    expect(servingOf(catalog, emptyBuilder(), 'Mystery')).toEqual({
      ml: 50,
      abvPct: 40,
    });
  });
});

describe('cocktailsForSpirit', () => {
  it('lists own cocktails first, then by name, marking the ones on the menu', () => {
    expect(cocktailsForSpirit(catalog, 'Gin 70cl', { 'Gin Lemon': 1 })).toEqual(
      [
        { key: 'Zed Mix', custom: true, inMenu: false, recipe: 'Gin + Vodka' },
        { key: 'Gin Lemon', custom: false, inMenu: true, recipe: 'Gin' },
        {
          key: 'Gin Tonic',
          custom: false,
          inMenu: false,
          recipe: 'Gin + Tonic Water + Ice kg',
        },
      ],
    );
  });
});
