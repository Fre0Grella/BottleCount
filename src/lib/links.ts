/**
 * Where the application actually lives, as seen from whichever build is asking.
 *
 * The application build serves the app at its own root, so a relative path is
 * right there. The documentation build has no app in it at all — it is deleted
 * from the output (see `astro.config.mjs`) — so its links have to point at the
 * real deployment, which `PUBLIC_APP_URL` names.
 *
 * Read through this rather than writing `${base}app` at each call site: those
 * were all correct until the two builds stopped being the same site, and there
 * is no failure at build time when one of them is missed — just a 404 for
 * whoever clicks it.
 */
export const APP_URL: string =
  import.meta.env.PUBLIC_APP_URL || `${import.meta.env.BASE_URL}app`;
