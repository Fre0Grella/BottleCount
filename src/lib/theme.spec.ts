import { afterEach, describe, expect, it, vi } from 'vitest';
import { faviconUrl } from './brand';
import {
  currentTheme,
  resolveTheme,
  themeInitScript,
  toggleTheme,
} from './theme';

describe('resolveTheme', () => {
  it('lets a Manual Override win over the System Theme', () => {
    expect(resolveTheme('light', 'dark')).toBe('light');
    expect(resolveTheme('dark', 'light')).toBe('dark');
  });

  it('follows the System Theme before any Manual Override', () => {
    expect(resolveTheme(null, 'light')).toBe('light');
    expect(resolveTheme(null, 'dark')).toBe('dark');
  });

  it('falls back to Dark Theme with neither', () => {
    expect(resolveTheme(null, null)).toBe('dark');
  });

  it('ignores a stored value that is not a Theme', () => {
    expect(resolveTheme('sepia', 'light')).toBe('light');
  });
});

/** Just enough of a page for the theme code: <html>, a favicon, storage. */
function fakePage(stored: string | null, prefers: 'light' | 'dark' | null) {
  const html = { dataset: {} as Record<string, string> };
  const icon = { href: 'unset' };
  const store = new Map<string, string>();
  if (stored !== null) store.set('bc-theme', stored);
  const page = {
    document: {
      documentElement: html,
      querySelector: (sel: string) =>
        sel === 'link[rel="icon"]' ? icon : null,
    },
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
    matchMedia: (q: string) => ({
      matches: prefers !== null && q === `(prefers-color-scheme: ${prefers})`,
    }),
  };
  return { page, html, icon, store };
}

/** Runs the inlined head script against a fake page, as a browser would. */
function runInitScript(page: ReturnType<typeof fakePage>['page']): void {
  new Function('document', 'localStorage', 'matchMedia', themeInitScript())(
    page.document,
    page.localStorage,
    page.matchMedia,
  );
}

describe('themeInitScript', () => {
  it.each([
    ['light', 'dark', 'light'],
    ['dark', 'light', 'dark'],
    [null, 'light', 'light'],
    [null, 'dark', 'dark'],
    [null, null, 'dark'],
  ] as const)(
    'stored %s, system %s → %s, favicon to match',
    (stored, system, expected) => {
      const { page, html, icon } = fakePage(stored, system);
      runInitScript(page);
      expect(html.dataset['theme']).toBe(expected);
      expect(icon.href).toBe(faviconUrl(expected));
    },
  );

  it('still applies a Theme when storage throws', () => {
    const { page, html } = fakePage(null, 'light');
    page.localStorage.getItem = () => {
      throw new Error('blocked');
    };
    runInitScript(page);
    expect(html.dataset['theme']).toBe('light');
  });
});

describe('toggleTheme', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('flips the Theme and records it as the Manual Override', () => {
    const { page, html, icon, store } = fakePage(null, 'light');
    vi.stubGlobal('document', page.document);
    vi.stubGlobal('localStorage', page.localStorage);
    runInitScript(page);
    expect(currentTheme()).toBe('light');

    expect(toggleTheme()).toBe('dark');
    expect(html.dataset['theme']).toBe('dark');
    expect(icon.href).toBe(faviconUrl('dark'));
    expect(store.get('bc-theme')).toBe('dark');
  });
});
