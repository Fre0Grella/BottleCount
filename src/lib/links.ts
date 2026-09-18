/**
 * Where the application lives, as seen from whichever build is asking.
 *
 * `PUBLIC_APP_ORIGIN` is set only by the documentation build, which contains no
 * application at all — `/app`, `/auth` and `/i` are deleted from its output
 * (see `astro.config.mjs`), so its links have to point at the real deployment.
 * The application build leaves it unset and everything stays relative, which is
 * what keeps a preview deployment and a self-hosted domain pointing at
 * themselves rather than at production.
 *
 * One variable rather than one per link: a separate canonical origin and app
 * URL would be two settings obliged to name the same host, and that is the kind
 * of pair that drifts apart the first time only one of them is updated.
 */
const APP_ORIGIN: string = import.meta.env.PUBLIC_APP_ORIGIN || '';

/**
 * The app's entry point. Read through this rather than writing `${base}app` at
 * each call site: those were all correct until the two builds stopped being the
 * same site, and nothing fails at build time when one is missed — only for
 * whoever clicks it.
 */
export const APP_URL: string = APP_ORIGIN
  ? `${APP_ORIGIN}/app`
  : `${import.meta.env.BASE_URL}app`;

/**
 * The origin that owns a page's content for search engines.
 *
 * The landing page, docs, pricing and legal pages are built for both hosts, so
 * without this they are duplicate content on two domains. Empty on the
 * application build, where each page already is its own canonical.
 */
export const CANONICAL_ORIGIN: string = APP_ORIGIN;
