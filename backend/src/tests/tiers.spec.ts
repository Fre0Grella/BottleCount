import { describe, expect, it } from 'vitest';
import {
  FEATURES,
  featuresFor,
  isTier,
  resolveTier,
} from '../../../shared/tiers';

describe('tier resolution', () => {
  it('treats a caller with no account as free', () => {
    expect(resolveTier({ storedTier: null, selfHosted: false })).toBe('free');
  });

  it('does not promote an anonymous caller on a self-hosted deployment', () => {
    // Co-organisers and invite links need to know who is who even when the
    // server is yours, so self-hosting grants pro on sign-in, not on arrival.
    expect(resolveTier({ storedTier: null, selfHosted: true })).toBe('free');
  });

  it('honours the stored tier on the hosted deployment', () => {
    expect(resolveTier({ storedTier: 'free', selfHosted: false })).toBe('free');
    expect(resolveTier({ storedTier: 'pro', selfHosted: false })).toBe('pro');
  });

  it('promotes any signed-in user of a self-hosted deployment to pro', () => {
    expect(resolveTier({ storedTier: 'free', selfHosted: true })).toBe('pro');
  });
});

describe('feature sets', () => {
  it('locks every paid feature on free', () => {
    const free = featuresFor('free');
    for (const feature of FEATURES) expect(free[feature]).toBe(false);
  });

  it('unlocks every feature on pro', () => {
    const pro = featuresFor('pro');
    for (const feature of FEATURES) expect(pro[feature]).toBe(true);
  });

  it('covers every declared feature in both tiers', () => {
    // Adding a feature to FEATURES without adding it to both tables would
    // otherwise leave it `undefined`, which reads as locked for pro users too.
    for (const tier of ['free', 'pro'] as const) {
      const set = featuresFor(tier);
      for (const feature of FEATURES) {
        expect(typeof set[feature]).toBe('boolean');
      }
    }
  });
});

describe('isTier', () => {
  it('accepts the known tiers and nothing else', () => {
    expect(isTier('free')).toBe(true);
    expect(isTier('pro')).toBe(true);
    expect(isTier('enterprise')).toBe(false);
    expect(isTier(undefined)).toBe(false);
  });
});
