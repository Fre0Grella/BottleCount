import { defineConfig } from 'vitest/config';

/**
 * Plain Vitest, not `@cloudflare/vitest-pool-workers`.
 *
 * The pool would run these against a real Workers runtime and a real local D1,
 * which is the right way to test the SQL in `repositories/d1/`. It is not used
 * here yet because its current release peers on Vitest 4 and this project is on
 * 5; the tests below therefore exercise routing, the session guard and the
 * entitlement rules through fake repositories, and the D1 statements are
 * covered only by `wrangler d1 migrations apply --local` in development.
 *
 * Swapping the pool back in is a config change and a `support/` swap, not a
 * rewrite: nothing in the tests reaches for a binding directly.
 */
export default defineConfig({
  test: {
    include: ['src/tests/**/*.spec.ts'],
    environment: 'node',
  },
});
