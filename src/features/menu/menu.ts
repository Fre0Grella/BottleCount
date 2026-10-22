import type { Party, PartyMenu } from '../../lib/types';

// Simple categories have no drinks layer — only a spirits layer.
const SIMPLE_CATEGORIES = new Set(['Beer', 'Wine']);

/** Beer and wine: bought by the bottle, with no cocktails under them. */
export function isSimpleCategory(cat: string): boolean {
  return SIMPLE_CATEGORIES.has(cat);
}

/**
 * Adjusts `entries[key].pct` to `val` (0..1), then redistributes the
 * remainder across unlocked sibling keys proportionally so the set sums to 1.
 * Locked keys (those present in the `locked` Set) stay fixed.
 * Rounding precision: 1/200 (matches the prototype).
 *
 * Mutates `entries` in place.
 */
export function rebalance(
  entries: Record<string, { pct: number }>,
  key: string,
  val: number,
  locked: Set<string>,
): void {
  const keys = Object.keys(entries);

  // Sum of locked siblings (excluding the key being changed)
  const lockedSum = keys
    .filter((k) => k !== key && locked.has(k))
    .reduce((s, k) => s + entries[k].pct, 0);

  // Maximum value the key can take (leave room for locked siblings)
  const avail = Math.max(0, 1 - lockedSum);
  val = Math.min(avail, Math.max(0, val));

  // Unlocked siblings (all except the key being set and locked keys)
  const others = keys.filter((k) => k !== key && !locked.has(k));

  // Apply the new value
  entries[key].pct = val;

  // Distribute the remainder across unlocked siblings proportionally
  const rest = avail - val;
  const restOld = others.reduce((s, k) => s + entries[k].pct, 0);
  for (const k of others) {
    entries[k].pct =
      restOld > 0
        ? (entries[k].pct / restOld) * rest
        : rest / (others.length || 1);
  }

  // Round everything to 1/200 precision
  for (const k of keys) {
    entries[k].pct = Math.round(entries[k].pct * 200) / 200;
  }

  // Push rounding delta to the largest remaining unlocked key
  // (mirrors the prototype's approach: pick the winner among `others`, fall
  //  back to `key` when there are no others)
  const target =
    others.length > 0
      ? others.reduce((a, b) => (entries[a].pct >= entries[b].pct ? a : b))
      : key;

  const sum = keys.reduce((s, k) => s + entries[k].pct, 0);
  entries[target].pct = Math.max(
    0,
    Math.round((entries[target].pct + (1 - sum)) * 200) / 200,
  );
}

// ── Shares ──────────────────────────────────────────────────────────────────

/**
 * `rebalance` over a plain name → share map, the shape a spirit's drinks are
 * stored in. Writes the result back into `shares`.
 */
function rebalanceShares(
  shares: Record<string, number>,
  key: string,
  val: number,
  locked: Set<string> = new Set(),
): void {
  const entries: Record<string, { pct: number }> = {};
  for (const [k, v] of Object.entries(shares)) entries[k] = { pct: v };
  rebalance(entries, key, val, locked);
  for (const [k, v] of Object.entries(entries)) shares[k] = v.pct;
}

/** The keys locked under `prefix` (`m:` for categories, `s:Cat:` for spirits). */
function lockedUnder(p: Party, prefix: string): Set<string> {
  return new Set(
    Object.keys(p.locks)
      .filter((k) => k.startsWith(prefix) && p.locks[k])
      .map((k) => k.slice(prefix.length)),
  );
}

/** Gives every key the same share, after one was removed. */
function shareEvenly(shares: Record<string, number>): void {
  const keys = Object.keys(shares);
  for (const k of keys) shares[k] = 1 / keys.length;
}

// ── Menu edits ──────────────────────────────────────────────────────────────
//
// Each takes the party to edit and mutates it, so the store can run them
// inside `update()`. Asking for a category, spirit or drink that is not there
// does nothing.

export function rebalanceCategory(p: Party, cat: string, val: number): void {
  const shares: Record<string, number> = {};
  for (const [k, v] of Object.entries(p.menu)) shares[k] = v.macro_pct;
  rebalanceShares(shares, cat, val, lockedUnder(p, 'm:'));
  for (const [k, v] of Object.entries(shares)) p.menu[k].macro_pct = v;
}

export function rebalanceSpirit(
  p: Party,
  cat: string,
  spirit: string,
  val: number,
): void {
  const spirits = p.menu[cat]?.spirits;
  if (!spirits) return;
  rebalance(spirits, spirit, val, lockedUnder(p, `s:${cat}:`));
}

export function rebalanceDrink(
  p: Party,
  cat: string,
  spirit: string,
  drink: string,
  val: number,
): void {
  const drinks = p.menu[cat]?.spirits[spirit]?.drinks;
  if (drinks) rebalanceShares(drinks, drink, val);
}

export function addBottle(p: Party, cat: string, ingredientName: string): void {
  const spirits = p.menu[cat]?.spirits;
  if (!spirits || spirits[ingredientName]) return;
  spirits[ingredientName] = { pct: 0, drinks: {} };
  rebalance(
    spirits,
    ingredientName,
    1 / Object.keys(spirits).length,
    new Set(),
  );
}

export function removeBottle(p: Party, cat: string, spirit: string): void {
  const spirits = p.menu[cat]?.spirits;
  if (!spirits?.[spirit]) return;
  delete spirits[spirit];
  for (const entry of Object.values(spirits)) {
    entry.pct = 1 / Object.keys(spirits).length;
  }
}

export function addCocktail(
  p: Party,
  cat: string,
  spirit: string,
  name: string,
): void {
  const entry = p.menu[cat]?.spirits[spirit];
  if (!entry) return;
  const drinks = (entry.drinks ??= {});
  if (drinks[name] !== undefined) return;
  drinks[name] = 0;
  rebalanceShares(drinks, name, 1 / Object.keys(drinks).length);
}

export function removeCocktail(
  p: Party,
  cat: string,
  spirit: string,
  drink: string,
): void {
  const drinks = p.menu[cat]?.spirits[spirit]?.drinks;
  if (drinks?.[drink] === undefined) return;
  delete drinks[drink];
  shareEvenly(drinks);
}

/** Renames a cocktail in the menu, keeping its share. */
export function renameCocktail(
  p: Party,
  cat: string,
  spirit: string,
  oldName: string,
  newName: string,
): void {
  if (oldName === newName) return;
  const drinks = p.menu[cat]?.spirits[spirit]?.drinks;
  if (drinks?.[oldName] === undefined) return;
  const pct = drinks[oldName];
  delete drinks[oldName];
  drinks[newName] = pct;
}

// ── Checks ──────────────────────────────────────────────────────────────────

/** How far off 100% a layer may be before it is reported. */
const MENU_TOLERANCE = 0.01;

const sumsToOne = (shares: number[]): boolean =>
  Math.abs(shares.reduce((s, v) => s + v, 0) - 1) <= MENU_TOLERANCE;

/**
 * What in a menu does not add up, as the keys the UI marks:
 *  - 'macro'      — the categories don't sum to 1
 *  - '<CatName>'  — a category's spirits don't sum to 1
 *  - '<SpName>'   — a spirit's drinks don't sum to 1 (non-simple categories,
 *                   and only once the spirit has a drink)
 */
export function menuErrorKeys(menu: PartyMenu): string[] {
  const errs: string[] = [];
  if (!sumsToOne(Object.values(menu).map((c) => c.macro_pct))) {
    errs.push('macro');
  }

  for (const [cat, cd] of Object.entries(menu)) {
    if (!sumsToOne(Object.values(cd.spirits).map((s) => s.pct))) errs.push(cat);
    if (isSimpleCategory(cat)) continue;

    for (const [sp, spd] of Object.entries(cd.spirits)) {
      const drinks = Object.values(spd.drinks ?? {});
      if (drinks.length > 0 && !sumsToOne(drinks)) errs.push(sp);
    }
  }
  return errs;
}
