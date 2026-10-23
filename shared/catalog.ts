// ── Catalog ────────────────────────────────────────────────────────────────
//
// What drinks and food a menu can name. The preset catalog ships with the app
// (src/data/catalog.json); a party also carries copies of the entries it uses
// that are not preset, or whose price differs, so everyone who opens the party
// computes the same menu, shopping list and costs. Both the browser and the
// Worker read those copies, so the shape and its bounds live here.

export type IngredientType =
  | 'spirit'
  | 'beer'
  | 'wine'
  | 'mixer'
  | 'extra'
  | 'snack';

const INGREDIENT_TYPES: readonly IngredientType[] = [
  'spirit',
  'beer',
  'wine',
  'mixer',
  'extra',
  'snack',
];

export interface Ingredient {
  type: IngredientType;
  abv: number;
  volume_ml?: number;
  price_min: number;
  price_max: number;
  unit?: string;
  custom?: boolean;
}

interface CocktailRecipeItem {
  quantity: number;
  unit?: string;
}

export interface Cocktail {
  main_spirit: string;
  category?: string;
  recipe: Record<string, CocktailRecipeItem>;
  custom?: boolean;
}

export interface Catalog {
  ingredients: Record<string, Ingredient>;
  cocktails: Record<string, Cocktail>;
}

export function emptyCatalog(): Catalog {
  return { ingredients: {}, cocktails: {} };
}

// ── Reading a party's copies ────────────────────────────────────────────────

/** Bounds for a party's copies: a party uses a few dozen entries at most. */
const MAX_ENTRIES = 300;
const MAX_KEY = 80;
const MAX_RECIPE_ITEMS = 30;
const MAX_UNIT = 10;
const MAX_PRICE = 100_000;

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function amount(value: unknown, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(max, Math.max(0, value))
    : null;
}

function unitOf(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0
    ? value.slice(0, MAX_UNIT)
    : undefined;
}

function ingredientOf(value: unknown): Ingredient | null {
  const v = record(value);
  const type = v['type'] as IngredientType;
  if (!INGREDIENT_TYPES.includes(type)) return null;
  const priceMin = amount(v['price_min'], MAX_PRICE);
  const priceMax = amount(v['price_max'], MAX_PRICE);
  if (priceMin === null || priceMax === null) return null;
  const volume = amount(v['volume_ml'], 100_000);
  const unit = unitOf(v['unit']);
  return {
    type,
    abv: amount(v['abv'], 1) ?? 0,
    ...(volume !== null ? { volume_ml: volume } : {}),
    price_min: priceMin,
    price_max: priceMax,
    ...(unit ? { unit } : {}),
    ...(v['custom'] === true ? { custom: true } : {}),
  };
}

function cocktailOf(value: unknown): Cocktail | null {
  const v = record(value);
  const main = v['main_spirit'];
  if (typeof main !== 'string' || !main || main.length > MAX_KEY) return null;
  const recipe: Record<string, CocktailRecipeItem> = {};
  for (const [key, item] of Object.entries(record(v['recipe'])).slice(
    0,
    MAX_RECIPE_ITEMS,
  )) {
    const quantity = amount(record(item)['quantity'], 100_000);
    if (!key || key.length > MAX_KEY || quantity === null) continue;
    const unit = unitOf(record(item)['unit']);
    recipe[key] = { quantity, ...(unit ? { unit } : {}) };
  }
  const category =
    typeof v['category'] === 'string' ? v['category'].slice(0, 40) : undefined;
  return {
    main_spirit: main,
    ...(category ? { category } : {}),
    recipe,
    ...(v['custom'] === true ? { custom: true } : {}),
  };
}

function entries<T>(
  value: unknown,
  read: (v: unknown) => T | null,
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const [key, entry] of Object.entries(record(value)).slice(
    0,
    MAX_ENTRIES,
  )) {
    if (!key || key.length > MAX_KEY) continue;
    const parsed = read(entry);
    if (parsed) out[key] = parsed;
  }
  return out;
}

/**
 * A party's catalog copies as the server and every browser read them: any
 * entry that is not a well-formed ingredient or cocktail is dropped, numbers
 * are held to sane ranges, and the counts are capped. A document from before
 * the field existed reads as an empty catalog.
 */
export function normaliseCatalog(value: unknown): Catalog {
  const v = record(value);
  return {
    ingredients: entries(v['ingredients'], ingredientOf),
    cocktails: entries(v['cocktails'], cocktailOf),
  };
}
