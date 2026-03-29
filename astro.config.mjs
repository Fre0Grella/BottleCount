import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';

export default defineConfig({
  site: 'https://fre0grella.github.io',
  base: '/BottleCount',
  integrations: [vue()],
  output: 'static',
});
