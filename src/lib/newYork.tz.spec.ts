import { describe, expect, it } from 'vitest';

/**
 * The guard on the `new-york` project: if the zone did not take, the date
 * specs it reruns would pass in UTC and prove nothing.
 */
describe('the new-york test project', () => {
  it('runs west of UTC', () => {
    // EST in January: five hours behind.
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(300);
  });

  it('is where reading a date as UTC shows the day before', () => {
    expect(new Date('2026-11-14').getDate()).toBe(13);
  });
});
