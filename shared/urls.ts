import { isTicketSlug } from './ticketLinks';

/**
 * Every URL the app hands out, and the paths it reads them back from.
 *
 * One module so the host's share sheet, a guest's forward link, the Worker's
 * redirect and the page that resolves each of them cannot drift. Each builder
 * takes the live `origin` and the app's `base` path (`/` on Cloudflare,
 * `/BottleCount/` on GitHub Pages) — leaving the base out is how a build under
 * a prefix hands out links that miss it, and reading the origin rather than
 * hard-coding one is what keeps a preview deployment, a self-hosted domain and
 * `http://localhost` each pointing back at themselves.
 */

/** `/BottleCount` and `/BottleCount/` alike → `/BottleCount/`. */
export function withTrailingSlash(base: string): string {
  return base.endsWith('/') ? base : `${base}/`;
}

/** The link as a card shows it: without the scheme, which nobody reads. */
export function linkLabel(url: string): string {
  return url.replace(/^https?:\/\//, '');
}

// ── Builders ────────────────────────────────────────────────────────────────

/** A guest invite, `/i/<slug>`, with the forwarder's token when there is one. */
export function inviteUrl(
  origin: string,
  base: string,
  slug: string,
  token?: string | null,
): string {
  const url = `${origin}${withTrailingSlash(base)}i/${encodeURIComponent(slug)}`;
  return token ? `${url}?r=${encodeURIComponent(token)}` : url;
}

/**
 * A co-organiser invite, `/join/<token>`.
 *
 * Kept beside `inviteUrl` but separate from it: a guest invite and a
 * co-organiser invite grant wildly different things, and one function taking a
 * flag to decide which is a function that will eventually hand a guest an
 * editor's link.
 */
export function collaboratorUrl(
  origin: string,
  base: string,
  token: string,
): string {
  return `${origin}${withTrailingSlash(base)}join/${encodeURIComponent(token)}`;
}

/** What the ticket page shows that the signed payload does not carry. */
export interface TicketDisplay {
  party: string;
  /** ISO date, `YYYY-MM-DD`. */
  date: string;
  /** Index into `COVERS`. */
  cover: number;
  /** Start time, `HH:MM`, when there is one. */
  time?: string;
}

/**
 * A long ticket link: the signed ticket and what the page shows beside it, all
 * in the fragment, which browsers never send to a server (see
 * `src/features/tickets/ticketLink.ts`).
 */
export function ticketUrl(
  origin: string,
  base: string,
  signed: string,
  display: TicketDisplay,
): string {
  // URLSearchParams escapes the `+`, `/` and `=` of the base64 halves, and
  // decodes them back in parseTicketHash — never build this by concatenation.
  const params = new URLSearchParams({
    t: signed,
    p: display.party,
    d: display.date,
    c: String(display.cover),
  });
  if (display.time) params.set('h', display.time);
  return `${origin}${withTrailingSlash(base)}t/#${params.toString()}`;
}

/** A short ticket link: `<origin><base>t/<slug>`. */
export function shortTicketUrl(
  origin: string,
  base: string,
  slug: string,
): string {
  return `${origin}${withTrailingSlash(base)}t/${slug}`;
}

// ── Reading them back ───────────────────────────────────────────────────────

/** The path below the base, without its leading slash. */
function pathBelowBase(pathname: string, base: string): string {
  const prefix = withTrailingSlash(base);
  return pathname.startsWith(prefix)
    ? pathname.slice(prefix.length)
    : pathname.replace(/^\//, '');
}

/**
 * The segment after `<base><route>/`, decoded, or '' when the path is not that
 * route or the segment is mangled. A static build cannot route on these on its
 * own — a Pages Function rewrites them onto one page each, which reads its key
 * back off the URL with this.
 */
export function pathParam(
  pathname: string,
  base: string,
  route: 'i' | 'join',
): string {
  const match = new RegExp(`^${route}/([^/?#]+)`).exec(
    pathBelowBase(pathname, base),
  );
  if (!match?.[1]) return '';
  try {
    return decodeURIComponent(match[1]);
  } catch {
    // A lone `%` from a link cut short: no key, rather than a crash.
    return '';
  }
}

/** The slug of a short ticket link's path, or '' on the bare `/t/` page. */
export function ticketSlugFromPath(pathname: string, base: string): string {
  const match = /^t\/([^/?#]+)\/?$/.exec(pathBelowBase(pathname, base));
  const slug = match?.[1] ?? '';
  return isTicketSlug(slug) ? slug : '';
}
