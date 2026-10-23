import { describe, expect, it } from 'vitest';
import {
  addBottle,
  addCocktail,
  isSimpleCategory,
  menuErrorKeys,
  rebalance,
  rebalanceCategory,
  rebalanceDrink,
  rebalanceSpirit,
  removeBottle,
  removeCocktail,
  renameCocktail,
} from './menu';
import type { Party, PartyMenu } from '../../lib/types';

/** A party with only what the menu actions read. */
function party(menu: PartyMenu, locks: Record<string, boolean> = {}): Party {
  return { menu, locks } as Party;
}

function menu(): PartyMenu {
  return {
    Beer: { macro_pct: 0.3, spirits: { Lager: { pct: 1 } } },
    Cocktails: {
      macro_pct: 0.5,
      spirits: {
        Gin: { pct: 0.6, drinks: { 'Gin Tonic': 0.7, Negroni: 0.3 } },
        Rum: { pct: 0.4, drinks: { Mojito: 1 } },
      },
    },
    Wine: {
      macro_pct: 0.2,
      spirits: { Red: { pct: 0.5 }, White: { pct: 0.5 } },
    },
  };
}

describe('rebalance', () => {
  it('spreads the remainder over the unlocked siblings, in proportion', () => {
    const entries = { a: { pct: 0.5 }, b: { pct: 0.3 }, c: { pct: 0.2 } };
    rebalance(entries, 'a', 0.7, new Set());
    expect(entries).toEqual({
      a: { pct: 0.7 },
      b: { pct: 0.18 },
      c: { pct: 0.12 },
    });
  });

  it('leaves a locked sibling where it is', () => {
    const entries = { a: { pct: 0.5 }, b: { pct: 0.3 }, c: { pct: 0.2 } };
    rebalance(entries, 'a', 0.6, new Set(['b']));
    expect(entries).toEqual({
      a: { pct: 0.6 },
      b: { pct: 0.3 },
      c: { pct: 0.1 },
    });
  });

  it('caps the key at what the locked siblings leave', () => {
    const entries = { a: { pct: 0.5 }, b: { pct: 0.5 } };
    rebalance(entries, 'a', 0.9, new Set(['b']));
    expect(entries).toEqual({ a: { pct: 0.5 }, b: { pct: 0.5 } });
  });
});

describe('menu actions', () => {
  it('rebalances a category against the unlocked categories', () => {
    const p = party(menu(), { 'm:Wine': true });
    rebalanceCategory(p, 'Beer', 0.4);
    expect(p.menu.Beer.macro_pct).toBe(0.4);
    expect(p.menu.Cocktails.macro_pct).toBe(0.4);
    expect(p.menu.Wine.macro_pct).toBe(0.2);
  });

  it('rebalances a spirit within its category, honouring its locks', () => {
    const p = party(menu());
    rebalanceSpirit(p, 'Cocktails', 'Gin', 0.8);
    expect(p.menu.Cocktails.spirits.Gin.pct).toBe(0.8);
    expect(p.menu.Cocktails.spirits.Rum.pct).toBe(0.2);

    const locked = party(menu(), { 's:Cocktails:Rum': true });
    rebalanceSpirit(locked, 'Cocktails', 'Gin', 0.8);
    expect(locked.menu.Cocktails.spirits.Gin.pct).toBe(0.6);
    expect(locked.menu.Cocktails.spirits.Rum.pct).toBe(0.4);
  });

  it('rebalances a drink within its spirit', () => {
    const p = party(menu());
    rebalanceDrink(p, 'Cocktails', 'Gin', 'Negroni', 0.5);
    expect(p.menu.Cocktails.spirits.Gin.drinks).toEqual({
      'Gin Tonic': 0.5,
      Negroni: 0.5,
    });
  });

  it('adds a bottle with an equal share, and ignores one already there', () => {
    const p = party(menu());
    addBottle(p, 'Wine', 'Rosé');
    expect(p.menu.Wine.spirits).toEqual({
      Red: { pct: 0.33 },
      White: { pct: 0.335 },
      Rosé: { pct: 0.335, drinks: {} },
    });
    addBottle(p, 'Wine', 'Red');
    expect(Object.keys(p.menu.Wine.spirits)).toHaveLength(3);
  });

  it('removes a bottle and shares its category out evenly', () => {
    const p = party(menu());
    removeBottle(p, 'Cocktails', 'Rum');
    expect(p.menu.Cocktails.spirits.Gin.pct).toBe(1);
  });

  it('adds a cocktail with an equal share, and ignores one already there', () => {
    const p = party(menu());
    addCocktail(p, 'Cocktails', 'Rum', 'Daiquiri');
    expect(p.menu.Cocktails.spirits.Rum.drinks).toEqual({
      Mojito: 0.5,
      Daiquiri: 0.5,
    });
    addCocktail(p, 'Cocktails', 'Rum', 'Mojito');
    expect(p.menu.Cocktails.spirits.Rum.drinks).toEqual({
      Mojito: 0.5,
      Daiquiri: 0.5,
    });
  });

  it('gives a spirit with no drinks map its first cocktail', () => {
    const p = party(menu());
    addCocktail(p, 'Wine', 'Red', 'Sangria');
    expect(p.menu.Wine.spirits.Red.drinks).toEqual({ Sangria: 1 });
  });

  it('removes a cocktail and shares its spirit out evenly', () => {
    const p = party(menu());
    removeCocktail(p, 'Cocktails', 'Gin', 'Negroni');
    expect(p.menu.Cocktails.spirits.Gin.drinks).toEqual({ 'Gin Tonic': 1 });
  });

  it('renames a cocktail, keeping its share', () => {
    const p = party(menu());
    renameCocktail(p, 'Cocktails', 'Gin', 'Negroni', 'Negroni Sbagliato');
    expect(p.menu.Cocktails.spirits.Gin.drinks).toEqual({
      'Gin Tonic': 0.7,
      'Negroni Sbagliato': 0.3,
    });
  });

  it('does nothing for a category or spirit that is not there', () => {
    const p = party(menu());
    const before = structuredClone(p.menu);
    rebalanceSpirit(p, 'Spritz', 'Aperol', 0.5);
    rebalanceDrink(p, 'Cocktails', 'Vodka', 'Mule', 0.5);
    addBottle(p, 'Spritz', 'Aperol');
    removeBottle(p, 'Cocktails', 'Vodka');
    addCocktail(p, 'Cocktails', 'Vodka', 'Mule');
    removeCocktail(p, 'Cocktails', 'Gin', 'Mule');
    renameCocktail(p, 'Cocktails', 'Gin', 'Mule', 'Moscow Mule');
    expect(p.menu).toEqual(before);
  });
});

describe('menuErrorKeys', () => {
  it('finds nothing wrong with a menu whose every layer sums to 1', () => {
    expect(menuErrorKeys(menu())).toEqual([]);
  });

  it('names the layer that does not sum to 1', () => {
    const m = menu();
    m.Beer.macro_pct = 0.1;
    m.Wine.spirits.Red.pct = 0.2;
    m.Cocktails.spirits.Gin.drinks!.Negroni = 0.1;
    expect(menuErrorKeys(m)).toEqual(['macro', 'Gin', 'Wine']);
  });

  it('tolerates half a percent and flags two', () => {
    const near = menu();
    near.Beer.macro_pct = 0.295;
    expect(menuErrorKeys(near)).toEqual([]);

    const off = menu();
    off.Beer.macro_pct = 0.28;
    expect(menuErrorKeys(off)).toEqual(['macro']);
  });

  it('does not ask a spirit with no cocktails yet to sum to 1', () => {
    const m = menu();
    m.Cocktails.spirits.Rum.drinks = {};
    expect(menuErrorKeys(m)).toEqual([]);
  });

  it('has no drinks layer for beer and wine', () => {
    const m = menu();
    m.Wine.spirits.Red.drinks = { Sangria: 0.2 };
    expect(menuErrorKeys(m)).toEqual([]);
  });
});

describe('isSimpleCategory', () => {
  it('is true only for the categories with no drinks layer', () => {
    expect(isSimpleCategory('Beer')).toBe(true);
    expect(isSimpleCategory('Wine')).toBe(true);
    expect(isSimpleCategory('Cocktails')).toBe(false);
  });
});
