import { describe, expect, it } from 'vitest';
import { canUse, featuresFor } from './tiers';

describe('canUse', () => {
  const free = featuresFor('free');
  const pro = featuresFor('pro');

  it('gives a free co-organiser the Pro features of a Pro party', () => {
    expect(canUse('rsvpFunnel', free, pro)).toBe(true);
    expect(canUse('inviteLink', free, pro)).toBe(true);
    expect(canUse('doorScannerSync', free, pro)).toBe(true);
  });

  it('leaves a free viewer free outside such a party', () => {
    expect(canUse('rsvpFunnel', free, null)).toBe(false);
    expect(canUse('rsvpFunnel', free, undefined)).toBe(false);
  });

  it('keeps a Pro viewer Pro on a party whose owner is free', () => {
    // Their own plan still applies; a party never takes features away.
    expect(canUse('rsvpFunnel', pro, free)).toBe(true);
  });

  it('locks what neither the viewer nor the party has', () => {
    expect(canUse('coOrganizers', free, free)).toBe(false);
  });
});
