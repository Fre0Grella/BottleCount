import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatClockTime,
  formatLocalDate,
  localIsoDate,
  parseLocalDate,
  shortDate,
} from './dates';

/**
 * Runs in every time zone the suite is run in — `npm test` runs it a second
 * time under America/New_York (see `vitest.config.ts`), which is where reading
 * a date as UTC used to show the day before.
 */

afterEach(() => {
  vi.useRealTimers();
});

describe('parseLocalDate', () => {
  it('is local midnight on that day', () => {
    const date = parseLocalDate('2026-11-14');
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(10);
    expect(date?.getDate()).toBe(14);
    expect(date?.getHours()).toBe(0);
  });

  it.each(['', '14/11/2026', '2026-11-14T00:00:00Z', '2026-02-31', 'soon'])(
    'is null for %j',
    (value) => {
      expect(parseLocalDate(value)).toBeNull();
    },
  );

  it('is null for nothing', () => {
    expect(parseLocalDate(undefined)).toBeNull();
    expect(parseLocalDate(null)).toBeNull();
  });
});

describe('localIsoDate', () => {
  it('round-trips a parsed date', () => {
    expect(localIsoDate(parseLocalDate('2026-01-05')!)).toBe('2026-01-05');
  });

  it('is the local day, even when UTC has moved on to the next', () => {
    // 22:30 on 14 Nov here; in New York that is already the 15th in UTC.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 14, 22, 30));
    expect(localIsoDate()).toBe('2026-11-14');
  });
});

describe('formatLocalDate', () => {
  it('prints the day it was given', () => {
    expect(
      formatLocalDate(
        '2026-11-14',
        { weekday: 'long', day: 'numeric', month: 'long' },
        'en-GB',
      ),
    ).toBe('Saturday 14 November');
  });

  it('is empty for something that is not a date', () => {
    expect(formatLocalDate('', { day: 'numeric' })).toBe('');
    expect(formatLocalDate('tomorrow', { day: 'numeric' })).toBe('');
  });
});

describe('shortDate', () => {
  it('is day and short month', () => {
    expect(shortDate('2026-11-14')).toBe('14 Nov');
    expect(shortDate('2026-01-01')).toBe('1 Jan');
  });
});

describe('formatClockTime', () => {
  it('prints an ISO timestamp as local HH:MM', () => {
    const at = new Date(2026, 10, 14, 23, 5);
    expect(formatClockTime(at.toISOString())).toBe('23:05');
  });

  it('passes a time that is already HH:MM through', () => {
    expect(formatClockTime('21:40')).toBe('21:40');
  });

  it('is empty when there is no time', () => {
    expect(formatClockTime(undefined)).toBe('');
    expect(formatClockTime(null)).toBe('');
    expect(formatClockTime('')).toBe('');
  });
});
