import { describe, expect, it } from 'vitest';
import catalogData from '../../data/catalog.json';
import { applyDocument, documentOf } from '../../lib/collab';
import { calculate, planFor } from '../party/core';
import { newParty } from '../party/partyDefaults';
import { defaultExtras } from './catalog';
import {
  adoptCatalog,
  partyCatalog,
  pickerCatalog,
  snackNames,
  takeFromLibrary,
} from './partyCatalog';
import type { Catalog, Ingredient, Party } from '../../lib/types';

const PRESET = catalogData as Catalog;
const EXTRAS = Object.keys(defaultExtras());

const houseGin: Ingredient = {
  type: 'spirit',
  abv: 0.42,
  volume_ml: 700,
  price_min: 18,
  price_max: 22,
  custom: true,
};
const yuzu: Ingredient = {
  type: 'mixer',
  abv: 0,
  volume_ml: 1000,
  price_min: 4,
  price_max: 5,
  custom: true,
};

/** A library like loadCatalog builds: preset, its overrides, custom entries. */
function ownerLibrary(): Catalog {
  const library = structuredClone(PRESET);
  library.ingredients['Tonic Water 1L'] = {
    ...library.ingredients['Tonic Water 1L']!,
    price_min: 0.5,
    price_max: 0.6,
  };
  library.ingredients['House Gin 70cl'] = houseGin;
  library.ingredients['Yuzu Soda 1L'] = yuzu;
  library.cocktails['House Yuzu'] = {
    main_spirit: 'House Gin 70cl',
    recipe: {
      'House Gin 70cl': { quantity: 50 },
      'Yuzu Soda 1L': { quantity: 150 },
    },
    custom: true,
  };
  return library;
}

/** A party with the custom gin and its cocktail next to a Gin Tonic. */
function party(): Party {
  const p = newParty() as Party;
  p.menu = {
    Spirits: {
      macro_pct: 1,
      spirits: {
        'Gin 70cl': { pct: 0.5, drinks: { 'Gin Tonic': 1 } },
        'House Gin 70cl': { pct: 0.5, drinks: { 'House Yuzu': 1 } },
      },
    },
  };
  return p;
}

function shoppingOf(p: Party) {
  const settings = {
    ...p.settings,
    guests: 40,
    extras: defaultExtras(),
    menu: p.menu,
  };
  return calculate(planFor(settings, true), partyCatalog(p)).shopping_list;
}

describe('adoptCatalog', () => {
  it('copies what only the library has: custom entries, recipe items, prices', () => {
    const p = party();
    expect(adoptCatalog(p, ownerLibrary(), EXTRAS)).toBe(true);
    expect(Object.keys(p.catalog.cocktails)).toEqual(['House Yuzu']);
    expect(Object.keys(p.catalog.ingredients).sort()).toEqual([
      'House Gin 70cl',
      'Tonic Water 1L',
      'Yuzu Soda 1L',
    ]);
    expect(p.catalog.ingredients['Tonic Water 1L']?.price_min).toBe(0.5);
  });

  it('copies nothing the preset already says', () => {
    const p = party();
    adoptCatalog(p, ownerLibrary(), EXTRAS);
    expect(p.catalog.ingredients['Gin 70cl']).toBeUndefined();
    expect(p.catalog.cocktails['Gin Tonic']).toBeUndefined();
  });

  it('never replaces or drops a copy because a library lacks it', () => {
    const p = party();
    adoptCatalog(p, ownerLibrary(), EXTRAS);
    const before = structuredClone(p.catalog);
    // A co-organiser's library: preset only, and Gin hidden.
    const other = structuredClone(PRESET);
    delete other.ingredients['Gin 70cl'];
    expect(adoptCatalog(p, other, EXTRAS)).toBe(false);
    expect(p.catalog).toEqual(before);
  });

  it('drops a copy once the menu stops using it', () => {
    const p = party();
    adoptCatalog(p, ownerLibrary(), EXTRAS);
    delete p.menu['Spirits']!.spirits['House Gin 70cl'];
    expect(adoptCatalog(p, ownerLibrary(), EXTRAS)).toBe(true);
    expect(Object.keys(p.catalog.ingredients)).toEqual(['Tonic Water 1L']);
    expect(p.catalog.cocktails).toEqual({});
  });
});

describe('a shared party', () => {
  it('computes the same shopping list for the owner and a co-organiser', () => {
    const owner = party();
    adoptCatalog(owner, ownerLibrary(), EXTRAS);

    // The co-organiser's browser: preset library, the party from the server.
    const coOrganiser = newParty() as Party;
    applyDocument(coOrganiser, documentOf(owner));
    adoptCatalog(coOrganiser, structuredClone(PRESET), EXTRAS);

    const list = shoppingOf(owner);
    expect(list.map((i) => i.name)).toContain('Yuzu Soda 1L');
    expect(shoppingOf(coOrganiser)).toEqual(list);
  });

  it('still resolves a preset entry the viewer hid from their library', () => {
    const p = party();
    adoptCatalog(p, ownerLibrary(), EXTRAS);
    expect(partyCatalog(p).ingredients['Gin 70cl']).toEqual(
      PRESET.ingredients['Gin 70cl'],
    );
  });
});

describe('takeFromLibrary', () => {
  it('replaces the copy with the edited entry', () => {
    const p = party();
    const library = ownerLibrary();
    adoptCatalog(p, library, EXTRAS);
    library.ingredients['House Gin 70cl'] = { ...houseGin, price_min: 25 };
    takeFromLibrary(p, 'ingredients', 'House Gin 70cl', library);
    expect(p.catalog.ingredients['House Gin 70cl']?.price_min).toBe(25);
  });

  it('goes back to the preset when the edit matches it', () => {
    const p = party();
    const library = ownerLibrary();
    adoptCatalog(p, library, EXTRAS);
    library.ingredients['Tonic Water 1L'] =
      PRESET.ingredients['Tonic Water 1L']!;
    takeFromLibrary(p, 'ingredients', 'Tonic Water 1L', library);
    expect(p.catalog.ingredients['Tonic Water 1L']).toBeUndefined();
  });
});

describe('pickerCatalog', () => {
  it("offers the library, with the party's copies in place of its own", () => {
    const p = party();
    adoptCatalog(p, ownerLibrary(), EXTRAS);
    const picker = pickerCatalog(structuredClone(PRESET), p);
    expect(picker.ingredients['House Gin 70cl']).toEqual(houseGin);
    expect(picker.ingredients['Tonic Water 1L']?.price_min).toBe(0.5);
  });
});

describe('snackNames', () => {
  it('lists the snacks the party buys, not every snack anyone has', () => {
    const p = party();
    p.catalog.ingredients['Olives 200g'] = { ...yuzu, type: 'snack' };
    const snacks = snackNames(p, EXTRAS);
    expect(snacks).not.toContain('Olives 200g');
    expect(snacks.length).toBeGreaterThan(0);
    for (const name of snacks) expect(EXTRAS).toContain(name);
  });
});
