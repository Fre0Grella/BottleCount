import type { Ingredient, IngredientType } from '../../lib/types';
import { formatEuroRange } from '../../lib/display';

// ── Names ──────────────────────────────────────────────────────────────────

/** Strip a trailing size suffix (e.g. "Gin 70cl" → "Gin"). */
export function shortName(key: string): string {
  return key.replace(/\s+\d+(?:cl|ml|L|kg|g)$/i, '').trim();
}

// ── What a type has ─────────────────────────────────────────────────────────

/** Drinks with alcohol: they carry a strength (ABV). */
export function typeHasAbv(type: IngredientType): boolean {
  return type === 'beer' || type === 'wine' || type === 'spirit';
}

/** Bought by the bottle: they carry a bottle size; the rest a free unit. */
export function typeHasVolume(type: IngredientType): boolean {
  return typeHasAbv(type) || type === 'mixer';
}

/** "40% · 700 ml · €12.00–€18.00", the line under an ingredient's name. */
export function ingredientMetaLine(ing: Ingredient): string {
  const parts: string[] = [];
  if (ing.abv && ing.abv > 0) parts.push(`${Math.round(ing.abv * 100)}%`);
  if (ing.volume_ml) parts.push(`${ing.volume_ml} ml`);
  else if (ing.unit) parts.push(ing.unit);
  parts.push(formatEuroRange(ing.price_min, ing.price_max, 'always'));
  return parts.join(' · ');
}

// ── The ingredient form ─────────────────────────────────────────────────────

/** The ingredient manager's fields, as typed (strings, ABV in percent). */
export interface IngredientFields {
  name: string;
  type: IngredientType;
  abv: string;
  vol: string;
  unit: string;
  priceMin: string;
  priceMax: string;
}

export function emptyIngredientFields(type: IngredientType): IngredientFields {
  return {
    name: '',
    type,
    abv: '',
    vol: '',
    unit: '',
    priceMin: '',
    priceMax: '',
  };
}

export function fieldsFromIngredient(
  name: string,
  ing: Ingredient,
): IngredientFields {
  return {
    name,
    type: ing.type,
    abv: ing.abv ? String(Math.round(ing.abv * 100)) : '',
    vol: ing.volume_ml ? String(ing.volume_ml) : '',
    unit: ing.unit ?? '',
    priceMin: String(ing.price_min),
    priceMax: String(ing.price_max),
  };
}

/**
 * The ingredient the fields describe. Only the fields its type has count:
 * strength for drinks with alcohol, a bottle size or else a free unit.
 */
export function ingredientFromFields(f: IngredientFields): Ingredient {
  const hasVol = typeHasVolume(f.type);
  return {
    type: f.type,
    abv: typeHasAbv(f.type) ? Number(f.abv) / 100 : 0,
    volume_ml: hasVol ? Number(f.vol) || undefined : undefined,
    unit: !hasVol && f.unit.trim() ? f.unit.trim() : undefined,
    price_min: Number(f.priceMin) || 0,
    price_max: Number(f.priceMax) || 0,
  };
}

/**
 * How an edit to a built-in ingredient is stored. Changing only the price
 * keeps the built-in with a price override; changing anything else (the name
 * too) hides the built-in and saves a personal copy.
 */
export function builtInEdit(
  original: Ingredient,
  originalName: string,
  edited: Ingredient,
  editedName: string,
): 'price-override' | 'replace' {
  const onlyPrice =
    Math.abs((original.abv ?? 0) - edited.abv) < 0.0001 &&
    original.volume_ml === edited.volume_ml &&
    (original.unit ?? '') === (edited.unit ?? '') &&
    originalName === editedName;
  return onlyPrice ? 'price-override' : 'replace';
}

// ── Bottles for a menu category ─────────────────────────────────────────────

type BottleType = 'spirit' | 'beer' | 'wine';

/** What a menu category is stocked with: beer, wine, or spirits. */
export function bottleTypeFor(cat: string): BottleType {
  if (cat === 'Beer') return 'beer';
  if (cat === 'Wine') return 'wine';
  return 'spirit';
}

const BOTTLE_DEFAULTS: Record<
  BottleType,
  { abv: string; vol: string; placeholder: string }
> = {
  beer: { abv: '5', vol: '660', placeholder: 'e.g. Craft IPA 33cl' },
  wine: { abv: '12', vol: '750', placeholder: 'e.g. Prosecco' },
  spirit: { abv: '40', vol: '700', placeholder: 'e.g. Mezcal' },
};

/** The new-bottle form's starting strength and size, and its placeholder. */
export function bottleDefaults(type: BottleType): {
  abv: string;
  vol: string;
  placeholder: string;
} {
  return BOTTLE_DEFAULTS[type];
}

/** "40% ABV · €12.00–€18.00", the line under a bottle in the picker. */
export function bottleMetaLine(ing: Ingredient): string {
  return (
    (ing.abv ? Math.round(ing.abv * 100) + '% ABV · ' : '') +
    formatEuroRange(ing.price_min, ing.price_max, 'always')
  );
}

/** A custom bottle's form fields: strength in percent, size in ml. */
export interface BottleFields {
  name: string;
  abv: string;
  vol: string;
  priceMin: string;
  priceMax: string;
}

export function bottleFromFields(
  type: BottleType,
  f: BottleFields,
): Ingredient {
  return {
    type,
    abv: (parseFloat(f.abv) || 0) / 100,
    volume_ml: parseInt(f.vol, 10) || 0,
    price_min: parseFloat(f.priceMin) || 0,
    price_max: parseFloat(f.priceMax) || 0,
  };
}
