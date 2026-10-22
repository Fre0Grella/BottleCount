/**
 * Small formatters every screen shares, so the same number or place reads the
 * same way wherever it appears.
 */

/**
 * Euros. `cents`: `'never'` rounds to whole euros (totals and estimates),
 * `'always'` shows two places (unit prices), `'auto'` shows them only when
 * there are any (a ticket price: €15, €12.50).
 */
export function formatEuro(
  value: number,
  cents: 'never' | 'always' | 'auto' = 'never',
): string {
  if (cents === 'always' || (cents === 'auto' && !Number.isInteger(value))) {
    return `€${value.toFixed(2)}`;
  }
  return `€${Math.round(value).toLocaleString()}`;
}

/** `€a–€b`, or one amount when both ends print the same. */
export function formatEuroRange(
  min: number,
  max: number,
  cents: 'never' | 'always' | 'auto' = 'never',
): string {
  const low = formatEuro(min, cents);
  const high = formatEuro(max, cents);
  return low === high ? low : `${low}–${high}`;
}

/**
 * Where a party is: `Place, City`, either alone, or '' for neither — the
 * caller picks its placeholder. The comma is the guest-facing invite page's.
 */
export function venueWhere(
  venue: { place?: string; city?: string } | null | undefined,
): string {
  return [venue?.place, venue?.city].filter(Boolean).join(', ');
}

/** How many `--seg-N` colours the theme defines. */
const SEG_COUNT = 5;

/**
 * The `i`th of the theme's segment colours, cycling: drink-split bars, menu
 * categories and guest avatars all take turns through the same five.
 */
export function segColor(i: number): string {
  return `var(--seg-${((i % SEG_COUNT) + SEG_COUNT) % SEG_COUNT})`;
}
