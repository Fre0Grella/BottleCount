import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';

// The same source builds for two hosts, and they disagree about the root:
// Cloudflare Pages serves the app at `/`, GitHub Pages serves the docs under
// `/BottleCount/`. Hard-coding either breaks the other, so both come from the
// environment and Cloudflare — the app's home — is the default.
const site = process.env.SITE ?? 'https://bottlecount.pages.dev';
const base = process.env.BASE_PATH ?? '/';

export default defineConfig({
  site,
  base,
  integrations: [vue()],
  output: 'static',
});
