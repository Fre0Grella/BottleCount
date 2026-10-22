/**
 * The BottleCount mark: a bottle standing as the stem of a "B", on a rounded
 * tile.
 *
 * This file is the one source of the logo. The `public/` logo and favicon files
 * are generated from it (`npm run brand`), the in-page `Logo` component draws
 * the same geometry, and a test fails if a committed file drifts from what this
 * file would write. Change the mark here, then regenerate.
 *
 * It imports nothing, so `scripts/brand.mjs` can load it with plain Node.
 */

/**
 * The two palettes, one per Theme. `tile` is the rounded square, `ink` the
 * bottle and the bowls. They are the theme's `--accent` and `--on-accent`
 * (src/styles/theme.css), which a test holds to these values.
 */
export const BRAND_PALETTES = {
  dark: { tile: '#FF7A3D', ink: '#1B0C04' },
  light: { tile: '#E8500F', ink: '#FFFFFF' },
} as const;

export type Theme = keyof typeof BRAND_PALETTES;

/** The bottle, on the 24-unit grid the app's icons use (`bottle` in icons.ts). */
export const BOTTLE_PATHS = [
  'M10 2h4v3l1 3v12a1 1 0 0 1-1 1h-4a1 1 0 0 1-1-1V8l1-3z',
  'M9 12h6',
] as const;

/** The mark on its 64-unit tile. */
export const MARK = {
  size: 64,
  radius: 18,
  /** The bottle, scaled up and moved left to stand as the B's stem. */
  stem: { transform: 'translate(0.4 11.5) scale(1.8)', strokeWidth: 2 },
  bowlWidth: 6,
  /** Runs down behind the lower bowl, so the two read as one letter. */
  upperBowl: 'M30.5 16h6.5a8.5 8.5 0 0 1 0 17h-6.5',
  /**
   * Drawn twice: filled with the tile colour to cut the upper bowl off, then
   * stroked open (top, curve, bottom) so the cut adds no vertical line.
   */
  lowerBowl: 'M30.5 30h8a9 9 0 0 1 0 18h-8',
} as const;

/** The mark as a standalone SVG file in the given Theme's palette. */
function logoSvg(theme: Theme): string {
  const { tile, ink } = BRAND_PALETTES[theme];
  const { size, radius, stem, bowlWidth, upperBowl, lowerBowl } = MARK;
  const bowl = `stroke="${ink}" stroke-width="${bowlWidth}" fill="none"`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" fill="none" role="img" aria-label="BottleCount">`,
    '  <!-- Generated from src/lib/brand.ts by `npm run brand`; edit that, not this. -->',
    `  <rect width="${size}" height="${size}" rx="${radius}" fill="${tile}"/>`,
    `  <g transform="${stem.transform}" stroke="${ink}" stroke-width="${stem.strokeWidth}" stroke-linecap="round" stroke-linejoin="round">`,
    ...BOTTLE_PATHS.map((d) => `    <path d="${d}"/>`),
    '  </g>',
    `  <path d="${upperBowl}" ${bowl}/>`,
    `  <path d="${lowerBowl}z" fill="${tile}"/>`,
    `  <path d="${lowerBowl}" ${bowl}/>`,
    '</svg>',
    '',
  ].join('\n');
}

const SUFFIX: Record<Theme, string> = { dark: 'Dark', light: 'Light' };

/**
 * Every file under `public/` that carries the mark, by file name. The logo and
 * the favicon are the same drawing; both names are kept because pages and
 * bookmarks already point at each.
 */
export function brandFiles(): Record<string, string> {
  const files: Record<string, string> = {};
  for (const theme of Object.keys(BRAND_PALETTES) as Theme[]) {
    files[`logo${SUFFIX[theme]}.svg`] = logoSvg(theme);
    files[`favicon${SUFFIX[theme]}.svg`] = logoSvg(theme);
  }
  return files;
}

/**
 * Where the logo for a Theme is served. A ticket or QR plate passes `'dark'`
 * whatever the page's Theme: ticket visuals are fixed branding (CONTEXT.md).
 */
export function logoUrl(theme: Theme): string {
  return `${import.meta.env.BASE_URL}logo${SUFFIX[theme]}.svg`;
}

/** Where the favicon for a Theme is served. */
export function faviconUrl(theme: Theme): string {
  return `${import.meta.env.BASE_URL}favicon${SUFFIX[theme]}.svg`;
}
