import { defineConfig } from 'vitest/config';

/**
 * Frontend unit tests.
 *
 * Deliberately narrow: this covers the pure logic in `src/lib/` — the parts
 * where a bug is silent and expensive, like a funnel refresh quietly dropping
 * the guests a host typed in by hand. Component rendering is not covered; that
 * needs a DOM environment and a different argument for its cost.
 *
 * The backend has its own runner (`backend/vitest.config.ts`) because it needs
 * different globals. `npm test` runs both.
 */
export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts'],
    environment: 'node',
  },
});
