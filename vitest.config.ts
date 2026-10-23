import vue from '@vitejs/plugin-vue';
import { configDefaults, defineConfig } from 'vitest/config';

/**
 * Frontend unit tests.
 *
 * Deliberately narrow: this covers the pure logic in `src/lib/` and the
 * feature folders' `.ts` modules — the parts where a bug is silent and
 * expensive, like a funnel refresh quietly dropping the guests a host typed in
 * by hand. Screens are not rendered. The one exception is the UI kit
 * (`src/components/`): its behaviour is accessibility — Escape, focus, the
 * switch's keys — which only a DOM shows, so it runs under happy-dom.
 *
 * The backend has its own runner (`backend/vitest.config.ts`) because it needs
 * different globals. `npm test` runs both.
 */
const COMPONENT_SPECS = ['src/components/**/*.spec.ts'];

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
          exclude: [
            ...configDefaults.exclude,
            '**/*.tz.spec.ts',
            ...COMPONENT_SPECS,
          ],
          environment: 'node',
        },
      },
      {
        plugins: [vue()],
        test: {
          name: 'dom',
          include: COMPONENT_SPECS,
          environment: 'happy-dom',
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
