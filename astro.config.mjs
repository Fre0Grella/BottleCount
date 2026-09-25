import { rm } from 'node:fs/promises';
import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';

/**
 * One source, two deployments, and they are not the same site.
 *
 * - **Cloudflare Pages** serves *the application*, at `/`, with the Worker
 *   behind it. Both tiers live here: free users get it without an account,
 *   paying users sign in. This is the default, because it is the product.
 * - **GitHub Pages** serves *the documentation*, under `/BottleCount/`. It is a
 *   marketing and reference site with no backend, so the application is left
 *   out of that build entirely — see `docsOnly` below.
 *
 * Neither root can be hard-coded without breaking the other, so both come from
 * the environment.
 */
const target = process.env.BUILD_TARGET ?? 'app';
const isDocs = target === 'docs';

const site =
  process.env.SITE ??
  (isDocs ? 'https://fre0grella.github.io' : 'https://bottlecount.pages.dev');
const base = process.env.BASE_PATH ?? (isDocs ? '/BottleCount/' : '/');

/**
 * Routes that are the application rather than documentation.
 *
 * Each one needs the Worker: `/app` for sign-in and every paid feature,
 * `/auth/callback` for the end of the OAuth round trip, `/i` for guest invite
 * links, `/join` for co-organiser invitations.
 * Publishing them to a host with no backend produces a site that looks like the
 * product and then fails halfway through it, which is worse than not being
 * there at all. Links to the app in the documentation point at the real one
 * instead, and those pages carry a canonical link to it — both from
 * `PUBLIC_APP_ORIGIN` (see `src/lib/links.ts`).
 */
const APP_ROUTES = ['app', 'auth', 'i', 'join'];

/**
 * Leaves the application out of a documentation build.
 *
 * This deletes from the output rather than filtering routes beforehand, because
 * `astro:routes:resolved` is informational — splicing its array is accepted and
 * then ignored, and the pages are emitted anyway. Doing it here at least keeps
 * the rule in the config, beside the list it applies, rather than in a step in
 * a workflow file that a local `BUILD_TARGET=docs` build would not run.
 */
function docsOnly() {
  return {
    name: 'bottlecount:docs-only',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        await Promise.all(
          APP_ROUTES.map((route) =>
            rm(new URL(`./${route}/`, dir), { recursive: true, force: true }),
          ),
        );
        logger.info(
          `documentation build — application left out: ${APP_ROUTES.map((r) => `/${r}`).join(', ')}`,
        );
      },
    },
  };
}

/**
 * Where `astro dev` finds the Worker — `wrangler dev` in the backend's own
 * terminal. Override with `BACKEND_DEV_URL` if it runs somewhere else.
 */
const backendDevUrl = process.env.BACKEND_DEV_URL ?? 'http://localhost:8787';

/**
 * What `functions/` does on Cloudflare, done by the dev server instead.
 *
 * The frontend only ever calls its own origin (`/api/session`, never
 * `localhost:8787/api/session`), because in production the Pages Functions
 * forward those paths to the Worker over a service binding. `astro dev` runs no
 * Pages Functions, so without this every call 404s, the session resolves to
 * anonymous, and every paid feature sits locked with no way to unlock it.
 *
 * `/auth/*` is listed path by path for the same reason `functions/auth/` is
 * three files rather than a catchall: `/auth/callback` is a page, not a route.
 */
const DEV_PROXY_PATHS = [
  '/api',
  '/invite',
  '/auth/dev',
  '/auth/google',
  '/auth/logout',
];

/**
 * `/i/<slug>` and `/join/<token>` are minted at runtime, so the build has one
 * page for each and `functions/i/` and `functions/join/` rewrite the whole
 * space onto it. This is that rewrite for the dev server; the browser's URL is
 * untouched and the page still reads the slug off it.
 */
function devRewrites() {
  const REWRITES = [
    [/^\/i\/[^/?#]+/, '/i/'],
    [/^\/join\/[^/?#]+/, '/join/'],
  ];
  return {
    name: 'bottlecount:dev-rewrites',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        for (const [pattern, target] of REWRITES) {
          if (req.url && pattern.test(req.url)) {
            req.url = req.url.replace(pattern, target);
            break;
          }
        }
        next();
      });
    },
  };
}

export default defineConfig({
  site,
  base,
  integrations: [vue(), ...(isDocs ? [docsOnly()] : [])],
  output: 'static',
  vite: {
    plugins: [devRewrites()],
    server: {
      proxy: Object.fromEntries(
        DEV_PROXY_PATHS.map((path) => [path, { target: backendDevUrl }]),
      ),
    },
  },
});
