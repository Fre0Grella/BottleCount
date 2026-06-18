import type { PartyMenu } from './types';
import { validateMenu } from './core';

// Simple categories have no drinks layer — only a spirits layer.
const SIMPLE_CATEGORIES = new Set(['Beer', 'Wine']);

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

  // Compute actual sum, treating locked siblings at their original (rounded)
  // values and the mutated key at its new value
  const sum = keys.reduce(
    (s, k) =>
      s + (locked.has(k) && k !== key ? entries[k].pct : entries[k].pct),
    0,
  );
  entries[target].pct = Math.max(
    0,
    Math.round((entries[target].pct + (1 - sum)) * 200) / 200,
  );
}

/**
 * Returns the list of error keys for a PartyMenu:
 *  - 'macro'      — macro percentages don't sum to 1
 *  - '<CatName>'  — category spirits don't sum to 1
 *  - '<SpName>'   — spirit drinks don't sum to 1 (non-simple categories only)
 *
 * Delegates to core.validateMenu for the actual checks, then maps the
 * human-readable error strings back to the canonical key identifiers used
 * by the UI (matching the prototype's menuErrors output shape).
 */
export function menuErrorKeys(menu: PartyMenu): string[] {
  const errs: string[] = [];

  // Macro layer
  const macroSum = Object.values(menu).reduce((s, v) => s + v.macro_pct, 0);
  if (Math.abs(macroSum - 1) > 0.011) errs.push('macro');

  // Spirit layer
  for (const [cat, cd] of Object.entries(menu)) {
    const spiritsSum = Object.values(cd.spirits).reduce((s, v) => s + v.pct, 0);
    if (Math.abs(spiritsSum - 1) > 0.011) errs.push(cat);

    // Drinks layer (non-simple categories only)
    if (!SIMPLE_CATEGORIES.has(cat)) {
      for (const [sp, spd] of Object.entries(cd.spirits)) {
        const drinks = spd.drinks ?? {};
        if (Object.keys(drinks).length === 0) continue;
        const drinksSum = Object.values(drinks).reduce((s, v) => s + v, 0);
        if (Math.abs(drinksSum - 1) > 0.011) errs.push(sp);
      }
    }
  }

  return errs;
}

// Re-export validateMenu so callers that only need the full error messages
// can import from a single place.
export { validateMenu };
