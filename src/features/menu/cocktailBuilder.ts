import type { Catalog, Cocktail } from '../../lib/types';
import { shortName } from './ingredients';

/**
 * The cocktail builder: a base spirit with a pour, more spirits and mixers or
 * extras each with a quantity (ml, or kg for an extra sold by weight).
 */
export interface Builder {
  /** Set when editing an existing cocktail. */
  editKey: string | null;
  name: string;
  mainQty: number;
  spirits: Record<string, number>;
  mixers: Record<string, number>;
}

/** The base spirit's pour: a 20-80 ml slider in 5 ml steps, 50 to start. */
export const BASE_POUR = { min: 20, max: 80, step: 5, start: 50 } as const;
/** Another spirit: 30 ml when ticked, ±10 ml a step. */
export const EXTRA_SPIRIT = { start: 30, step: 10 } as const;

/** A mixer or extra's step, unit and starting quantity, by how it is sold. */
export function mixerMeasure(isKg: boolean): {
  step: number;
  unit: 'kg' | 'ml';
  start: number;
} {
  return isKg
    ? { step: 0.05, unit: 'kg', start: 0.1 }
    : { step: 25, unit: 'ml', start: 100 };
}

/** "0.10 kg" or "100 ml". */
export function mixerQtyLabel(qty: number, isKg: boolean): string {
  return isKg ? `${qty.toFixed(2)} kg` : `${qty} ml`;
}

/** A quantity after a step, kept to 1/100 and never below 0. */
export function roundQty(qty: number): number {
  return Math.max(0, Math.round(qty * 100) / 100);
}

/** Ticks an ingredient on (at `start`) or off. Returns a new map. */
export function toggleQty(
  quantities: Record<string, number>,
  key: string,
  start: number,
): Record<string, number> {
  const next = { ...quantities };
  if (next[key] !== undefined) delete next[key];
  else next[key] = start;
  return next;
}

export function emptyBuilder(): Builder {
  return {
    editKey: null,
    name: '',
    mainQty: BASE_POUR.start,
    spirits: {},
    mixers: {},
  };
}

/** The builder pre-filled from a cocktail, split into its spirits and mixers. */
export function builderFromCocktail(
  catalog: Catalog,
  key: string,
  mainSpirit: string,
): Builder | null {
  const ck = catalog.cocktails[key];
  if (!ck) return null;
  const spirits: Record<string, number> = {};
  const mixers: Record<string, number> = {};
  let mainQty: number = BASE_POUR.start;
  for (const [k, v] of Object.entries(ck.recipe)) {
    if (k === mainSpirit) {
      mainQty = v.quantity;
      continue;
    }
    if (catalog.ingredients[k]?.type === 'spirit') spirits[k] = v.quantity;
    else mixers[k] = v.quantity;
  }
  return { editKey: key, name: key, mainQty, spirits, mixers };
}

/** The cocktail the builder describes, to save in the catalog. */
export function cocktailFromBuilder(
  b: Builder,
  mainSpirit: string,
  category: string,
): Cocktail {
  const recipe: Cocktail['recipe'] = {
    [mainSpirit]: { quantity: b.mainQty },
  };
  for (const [k, q] of Object.entries(b.spirits)) recipe[k] = { quantity: q };
  for (const [k, q] of Object.entries(b.mixers)) recipe[k] = { quantity: q };
  return { main_spirit: mainSpirit, category, recipe };
}

/**
 * One serving's volume (ml, rounded) and strength (% ABV, rounded). Extras
 * sold by weight add no volume; an unknown base spirit counts as 40%.
 */
export function servingOf(
  catalog: Catalog,
  b: Builder,
  mainSpirit: string,
): { ml: number; abvPct: number } {
  const mainAbv = catalog.ingredients[mainSpirit]?.abv ?? 0.4;
  let totalMl = b.mainQty;
  let totalAlc = b.mainQty * mainAbv;
  for (const [k, q] of Object.entries(b.spirits)) {
    totalMl += q;
    totalAlc += q * (catalog.ingredients[k]?.abv ?? 0);
  }
  for (const [k, q] of Object.entries(b.mixers)) {
    if (catalog.ingredients[k]?.unit !== 'kg') totalMl += q;
  }
  return {
    ml: Math.round(totalMl),
    abvPct: Math.round((totalAlc / (totalMl || 1)) * 100),
  };
}

/**
 * Every cocktail made on a spirit, the user's own first, then by name; each
 * says whether it is on the menu already and lists what goes in it.
 */
export function cocktailsForSpirit(
  catalog: Catalog,
  spirit: string,
  onMenu: Record<string, number>,
): { key: string; custom: boolean; inMenu: boolean; recipe: string }[] {
  return Object.entries(catalog.cocktails)
    .filter(([, v]) => v.main_spirit === spirit)
    .map(([k, v]) => ({
      key: k,
      custom: !!v.custom,
      inMenu: onMenu[k] !== undefined,
      recipe: Object.keys(v.recipe).map(shortName).join(' + '),
    }))
    .sort((a, b) => {
      if (a.custom !== b.custom) return a.custom ? -1 : 1;
      return a.key.localeCompare(b.key);
    });
}
