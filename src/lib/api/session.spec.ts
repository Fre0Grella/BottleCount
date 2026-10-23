import { afterEach, describe, expect, it, vi } from 'vitest';
import { featuresFor } from '../../../shared/tiers';
import {
  ANONYMOUS_SESSION,
  fetchSession,
} from '../../features/account/session';
import { errorCode } from './request';
import { devSignIn, logout, redeemLicence } from './session';
import { fakeWorker, sent } from './testing';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchSession', () => {
  it("returns the server's session", async () => {
    const session = {
      ...ANONYMOUS_SESSION,
      authenticated: true,
      tier: 'pro',
      features: featuresFor('pro'),
    };
    fakeWorker({ json: session });
    expect(await fetchSession()).toEqual(session);
  });

  it('falls back to the anonymous free tier on any failure', async () => {
    for (const answer of [
      'offline',
      { status: 501, json: { error: 'backend_unavailable' } },
      { text: '<!doctype html>' },
      { json: { hello: 'world' } },
    ] as const) {
      fakeWorker(answer);
      expect(await fetchSession()).toBe(ANONYMOUS_SESSION);
    }
  });
});

describe('api/session', () => {
  it("keeps the server's reason a licence was refused", async () => {
    const fake = fakeWorker({
      status: 409,
      json: { error: 'licence_already_redeemed' },
    });
    const result = await redeemLicence('BC-1');
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(errorCode(result.error)).toBe('licence_already_redeemed');
    expect(sent(fake)).toEqual({
      method: 'POST',
      path: '/api/licences/redeem',
      body: { code: 'BC-1' },
    });
  });

  it('tells an unreachable server apart from a refused sign-in', async () => {
    fakeWorker('offline');
    const offline = await devSignIn('a@b.c');
    fakeWorker({ status: 400, json: { error: 'email is required' } });
    const refused = await devSignIn('');
    expect(!offline.ok && offline.error.kind).toBe('network');
    expect(!refused.ok && refused.error.kind).toBe('http');
  });

  it('signs out quietly even when offline', async () => {
    fakeWorker('offline');
    await expect(logout()).resolves.toBeUndefined();
  });
});
