import catalogData from '../../data/catalog.json';
import type { Catalog, Party } from '../../lib/types';

/**
 * Which catalog a party is computed from.
 *
 * A party owns the entries it uses (see docs/adr/0003-co-organisers.md): its
 * `catalog` holds a copy of every ingredient and cocktail it names that is not
 * in the preset catalog, or whose price differs from it. Its menu, shopping
 * list and costs are computed from the preset plus those copies and nothing
 * else, so every organiser, on every device, gets the same numbers.
 *
 * Each browser's own catalog (`loadCatalog`: preset, minus what it hid, plus
 * its price overrides and custom entries) is a library to pick from. Picking
 * from it copies the entry into the party; editing an entry while the party is
 * open edits the party's copy too.
 */

type Kind = keyof Catalog;

const PRESET = catalogData as Catalog;

/** What a party's menu and costs read from: the preset plus its copies. */
export function partyCatalog(party: Pick<Party, 'catalog'>): Catalog {
  return {
    ingredients: { ...PRESET.ingredients, ...party.catalog.ingredients },
    cocktails: { ...PRESET.cocktails, ...party.catalog.cocktails },
  };
}

/**
 * What the pickers offer while a party is open: this browser's library, with
 * the party's copies in place of the library's own, so an entry shows the
 * price the party uses.
 */
export function pickerCatalog(
  library: Catalog,
  party: Pick<Party, 'catalog'> | undefined,
): Catalog {
  if (!party) return library;
  return {
    ingredients: { ...library.ingredients, ...party.catalog.ingredients },
    cocktails: { ...library.cocktails, ...party.catalog.cocktails },
  };
}

/**
 * Every entry the party's numbers depend on: the menu's spirits, beers and
 * wines, its cocktails and what their recipes call for, and the fixed extras.
 */
function usedKeys(
  party: Pick<Party, 'menu' | 'catalog'>,
  extras: readonly string[],
): Record<Kind, Set<string>> {
  const catalog = partyCatalog(party);
  const ingredients = new Set<string>(extras);
  const cocktails = new Set<string>();
  for (const category of Object.values(party.menu)) {
    for (const [spirit, entry] of Object.entries(category.spirits)) {
      ingredients.add(spirit);
      for (const drink of Object.keys(entry.drinks ?? {})) {
        // Used whether or not it resolves yet: a custom cocktail resolves
        // only once it is copied, which needs it counted first.
        cocktails.add(drink);
        const cocktail = catalog.cocktails[drink];
        if (!cocktail) continue;
        ingredients.add(cocktail.main_spirit);
        for (const item of Object.keys(cocktail.recipe)) ingredients.add(item);
      }
    }
  }
  return { ingredients, cocktails };
}

/** Plain data, with keys in a fixed order, for comparing two entries. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== 'custom')
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, v]) => [key, canonical(v)]),
  );
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** The library's entry, when the party would need a copy of it. */
function worthCopying(
  kind: Kind,
  key: string,
  library: Catalog,
): Catalog[Kind][string] | undefined {
  const own = library[kind][key];
  if (!own) return undefined;
  return same(own, PRESET[kind][key]) ? undefined : own;
}

/**
 * Brings the party's copies in line with its menu: an entry it now uses and
 * holds no copy of is copied from the library, when the library's differs from
 * the preset; a copy it no longer uses is dropped. An existing copy is never
 * replaced here: the party owns it, and only an edit replaces it.
 *
 * Cocktails first, since a copied cocktail can bring ingredients of its own.
 * Returns whether anything changed.
 */
export function adoptCatalog(
  party: Pick<Party, 'menu' | 'catalog'>,
  library: Catalog,
  extras: readonly string[],
): boolean {
  let changed = false;
  for (const kind of ['cocktails', 'ingredients'] as const) {
    const used = usedKeys(party, extras)[kind];
    const copies = party.catalog[kind] as Record<string, unknown>;
    for (const key of used) {
      if (key in copies) continue;
      const own = worthCopying(kind, key, library);
      if (own) {
        copies[key] = copy(own);
        changed = true;
      }
    }
    for (const key of Object.keys(copies)) {
      if (!used.has(key)) {
        delete copies[key];
        changed = true;
      }
    }
  }
  return changed;
}

/**
 * After an entry was edited in the library while this party is open: the
 * party takes the edited entry, or goes back to the preset when the edit
 * matches it.
 */
export function takeFromLibrary(
  party: Pick<Party, 'catalog'>,
  kind: Kind,
  key: string,
  library: Catalog,
): void {
  const copies = party.catalog[kind] as Record<string, unknown>;
  const own = worthCopying(kind, key, library);
  if (own) copies[key] = copy(own);
  else delete copies[key];
}

/** The snacks the party buys: the fixed extras that are snacks. */
export function snackNames(
  party: Pick<Party, 'catalog'>,
  extras: readonly string[],
): string[] {
  const catalog = partyCatalog(party);
  return extras.filter((name) => catalog.ingredients[name]?.type === 'snack');
}
