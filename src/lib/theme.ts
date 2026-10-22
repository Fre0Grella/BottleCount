import { faviconUrl, type Theme } from './brand';

/**
 * The Theme: which one is active, and the Theme Switch's Manual Override.
 *
 * Every page resolves it before first paint with `themeInitScript()` (inlined
 * by BaseLayout.astro), and every Theme Switch — the site nav's and the app's —
 * goes through `toggleTheme()`, so the order below is applied in one place.
 */
export type { Theme };

/** Where the Manual Override is kept. */
const THEME_KEY = 'bc-theme';

const FAVICONS: Record<Theme, string> = {
  dark: faviconUrl('dark'),
  light: faviconUrl('light'),
};

/**
 * Theme Resolution Order (CONTEXT.md): Manual Override → System Theme → Dark
 * Theme. `stored` is whatever the override key holds; `system` is the System
 * Theme, or null when the browser states no preference.
 *
 * Self-contained, because `themeInitScript` inlines its source.
 */
export function resolveTheme(
  stored: string | null,
  system: Theme | null,
): Theme {
  if (stored === 'dark' || stored === 'light') return stored;
  return system ?? 'dark';
}

/**
 * Makes `theme` the active Theme: the `data-theme` the stylesheets key on, and
 * the favicon, which is a Theme-Sensitive Asset.
 *
 * Self-contained, because `themeInitScript` inlines its source.
 */
function showTheme(theme: Theme, favicons: Record<Theme, string>): void {
  document.documentElement.dataset['theme'] = theme;
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (icon) icon.href = favicons[theme];
}

/**
 * The `<head>` script that applies the Theme before the page paints. It has
 * to be inline and blocking — a bundled module runs after first paint, and the
 * page would flash dark before turning light — so it is built from the two
 * functions above rather than written a second time.
 */
export function themeInitScript(): string {
  return `(function () {
  var stored = null;
  try { stored = localStorage.getItem(${JSON.stringify(THEME_KEY)}); } catch (e) {}
  var query = function (scheme) {
    return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: ' + scheme + ')').matches;
  };
  var system = query('light') ? 'light' : query('dark') ? 'dark' : null;
  (${showTheme.toString()})((${resolveTheme.toString()})(stored, system), ${JSON.stringify(FAVICONS)});
})();`;
}

/** The active Theme, as the head script resolved it. */
export function currentTheme(): Theme {
  return document.documentElement.dataset['theme'] === 'light'
    ? 'light'
    : 'dark';
}

/**
 * The Theme Switch: flips the Theme and records it as the Manual Override,
 * which wins over the System Theme from then on.
 */
export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  showTheme(next, FAVICONS);
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Storage blocked: the switch still works, it just won't be remembered.
  }
  return next;
}
