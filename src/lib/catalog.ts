import type { Catalog, Ingredient, Cocktail, Settings } from './types';
import { getKey, setKey } from './db';
import catalogData from '../data/catalog.json';
import settingsData from '../data/settings.json';

// ── Catalog merge ──────────────────────────────────────────────────────────

/**
 * Load the merged catalog:
 *  1. Start from the default catalog.json.
 *  2. Filter out hidden ingredients/cocktails.
 *  3. Apply price overrides to default entries.
 *  4. Merge personal entries on top (flagged custom:true).
 */
export async function loadCatalog(): Promise<Catalog> {
  const hiddenIng = await getKey<string[]>('hidden_ingredients', []);
  const hiddenCock = await getKey<string[]>('hidden_cocktails', []);
  const personalIng = await getKey<Record<string, Ingredient>>(
    'personal_ingredients',
    {},
  );
  const personalCock = await getKey<Record<string, Cocktail>>(
    'personal_cocktails',
    {},
  );
  const overrides = await getKey<
    Record<string, { price_min: number; price_max: number }>
  >('price_overrides', {});

  const base = JSON.parse(JSON.stringify(catalogData)) as Catalog;

  // Filter hidden, then apply price overrides to default ingredients
  const ings: Record<string, Ingredient> = Object.fromEntries(
    Object.entries(base.ingredients).filter(([k]) => !hiddenIng.includes(k)),
  );
  for (const [k, v] of Object.entries(overrides)) {
    if (ings[k]) {
      ings[k] = { ...ings[k], price_min: v.price_min, price_max: v.price_max };
    }
  }
  // Merge personal ingredients (mark as custom)
  for (const [k, v] of Object.entries(personalIng)) {
    ings[k] = { ...v, custom: true };
  }

  // Filter hidden cocktails, then merge personal cocktails (mark as custom)
  const cocks: Record<string, Cocktail> = Object.fromEntries(
    Object.entries(base.cocktails).filter(([k]) => !hiddenCock.includes(k)),
  );
  for (const [k, v] of Object.entries(personalCock)) {
    cocks[k] = { ...v, custom: true };
  }

  return { ingredients: ings, cocktails: cocks };
}

// ── Personal ingredient helpers ────────────────────────────────────────────

export async function savePersonalIngredient(
  name: string,
  ing: Ingredient,
): Promise<void> {
  const personal = await getKey<Record<string, Ingredient>>(
    'personal_ingredients',
    {},
  );
  personal[name] = ing;
  await setKey('personal_ingredients', personal);
}

export async function deleteIngredient(name: string): Promise<void> {
  const defaultIngs = (catalogData as Catalog).ingredients;
  if (defaultIngs[name]) {
    // Default entry — add to hidden list
    const hidden = await getKey<string[]>('hidden_ingredients', []);
    if (!hidden.includes(name)) hidden.push(name);
    await setKey('hidden_ingredients', hidden);
  } else {
    // Personal entry — remove from personal store
    const personal = await getKey<Record<string, Ingredient>>(
      'personal_ingredients',
      {},
    );
    delete personal[name];
    await setKey('personal_ingredients', personal);
  }
}

// ── Personal cocktail helpers ──────────────────────────────────────────────

export async function savePersonalCocktail(
  name: string,
  ck: Cocktail,
): Promise<void> {
  const personal = await getKey<Record<string, Cocktail>>(
    'personal_cocktails',
    {},
  );
  personal[name] = ck;
  await setKey('personal_cocktails', personal);
}

export async function deleteCocktail(name: string): Promise<void> {
  const defaultCocks = (catalogData as Catalog).cocktails;
  if (defaultCocks[name]) {
    // Default entry — add to hidden list
    const hidden = await getKey<string[]>('hidden_cocktails', []);
    if (!hidden.includes(name)) hidden.push(name);
    await setKey('hidden_cocktails', hidden);
  } else {
    // Personal entry — remove from personal store
    const personal = await getKey<Record<string, Cocktail>>(
      'personal_cocktails',
      {},
    );
    delete personal[name];
    await setKey('personal_cocktails', personal);
  }
}

// ── Price override helper ──────────────────────────────────────────────────

export async function setPriceOverride(
  name: string,
  price_min: number,
  price_max: number,
): Promise<void> {
  const defaultIngs = (catalogData as Catalog).ingredients;
  if (defaultIngs[name]) {
    // Override price for a default ingredient
    const overrides = await getKey<
      Record<string, { price_min: number; price_max: number }>
    >('price_overrides', {});
    overrides[name] = { price_min, price_max };
    await setKey('price_overrides', overrides);
  } else {
    // Update price directly in personal ingredients
    const personal = await getKey<Record<string, Ingredient>>(
      'personal_ingredients',
      {},
    );
    if (personal[name]) {
      personal[name].price_min = price_min;
      personal[name].price_max = price_max;
      await setKey('personal_ingredients', personal);
    }
  }
}

// ── Default extras ─────────────────────────────────────────────────────────

export function defaultExtras(): Settings['extras'] {
  return (settingsData as Settings).extras;
}
