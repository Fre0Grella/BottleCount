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
 * `/auth/callback` for the end of the OAuth round trip, `/i` for invite links.
 * Publishing them to a host with no backend produces a site that looks like the
 * product and then fails halfway through it, which is worse than not being
 * there at all. Links to the app in the documentation point at the real one
 * instead (`PUBLIC_APP_URL`).
 */
const APP_ROUTES = ['app', 'auth', 'i'];

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

export default defineConfig({
  site,
  base,
  integrations: [vue(), ...(isDocs ? [docsOnly()] : [])],
  output: 'static',
});
