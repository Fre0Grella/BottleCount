import { configDefaults, defineConfig } from 'vitest/config';

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
const SPECS = [
  'src/**/*.spec.ts',
  'shared/**/*.spec.ts',
  'functions/**/*.spec.ts',
];

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: SPECS,
          exclude: [...configDefaults.exclude, '**/*.tz.spec.ts'],
          environment: 'node',
        },
      },
      {
        // The date specs again, west of UTC. A party date read as UTC midnight
        // is the day before there, and CI runs in UTC, where the bug cannot
        // show — so this zone is pinned rather than inherited from the machine.
        test: {
          name: 'new-york',
          include: [
            'src/**/*.tz.spec.ts',
            'src/lib/dates.spec.ts',
            'src/features/tickets/ticket.spec.ts',
            'src/features/tickets/ticketMessage.spec.ts',
          ],
          environment: 'node',
          env: { TZ: 'America/New_York' },
        },
      },
    ],
  },
});
