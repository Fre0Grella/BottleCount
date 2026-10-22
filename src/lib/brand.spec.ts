import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BRAND_PALETTES, brandFiles, faviconUrl, logoUrl } from './brand';

function read(path: string): string {
  // CRLF-tolerant: a Windows checkout may hand back either.
  return readFileSync(new URL(path, import.meta.url), 'utf8').replace(
    /\r\n/g,
    '\n',
  );
}

/** The value a theme block in theme.css gives a custom property. */
function token(css: string, selector: string, name: string): string {
  const start = css.indexOf(selector);
  const block = css.slice(start, css.indexOf('}', start));
  const match = block.match(new RegExp(`${name}:\\s*([^;]+);`));
  return match?.[1]?.trim().toUpperCase() ?? '';
}

describe('brand files', () => {
  it.each(Object.entries(brandFiles()))(
    'public/%s is what `npm run brand` writes',
    (name, svg) => {
      expect(read(`../../public/${name}`)).toBe(svg);
    },
  );

  it('covers every logo and favicon the pages ask for', () => {
    const urls = (['dark', 'light'] as const).flatMap((t) => [
      logoUrl(t),
      faviconUrl(t),
    ]);
    expect(urls.map((u) => u.replace(/^\//, '')).sort()).toEqual(
      Object.keys(brandFiles()).sort(),
    );
  });
});

describe('brand palettes', () => {
  const css = read('../styles/theme.css');

  // The in-page Logo draws with --accent / --on-accent, the files with these
  // palettes; they have to be the same colours or the two marks disagree.
  it.each([
    ['dark', ":root,\n[data-theme='dark']"],
    ['light', "[data-theme='light']"],
  ] as const)('%s matches the theme tokens', (theme, selector) => {
    expect(token(css, selector, '--accent')).toBe(BRAND_PALETTES[theme].tile);
    expect(token(css, selector, '--on-accent')).toBe(BRAND_PALETTES[theme].ink);
  });
});
