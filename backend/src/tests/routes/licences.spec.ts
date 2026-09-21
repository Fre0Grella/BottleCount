import { describe, expect, it } from 'vitest';
import {
  aLicence,
  aUser,
  fakeLicences,
  fakeRepositories,
  fakeUsers,
} from '../support/fakeRepositories';
import { request, sessionCookie } from '../support/harness';

describe('POST /api/licences/redeem', () => {
  it('rejects an unauthenticated caller', async () => {
    // Unlike /api/session, this one really does need a session — it changes a
    // user's tier, so there has to be a user.
    const res = await request('/api/licences/redeem', {
      repositories: fakeRepositories(),
      method: 'POST',
      body: { code: 'BC-TEST-0001' },
    });

    expect(res.status).toBe(401);
  });

  it('upgrades the caller and reports the new feature set', async () => {
    const users = fakeUsers([aUser({ tier: 'free' })]);
    const res = await request('/api/licences/redeem', {
      repositories: fakeRepositories(users, fakeLicences([aLicence()])),
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: { code: 'BC-TEST-0001' },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ tier: 'pro' });
    expect(users.rows.get('user-1')?.tier).toBe('pro');
  });

  it('accepts a code typed in lower case', async () => {
    const users = fakeUsers([aUser()]);
    const res = await request('/api/licences/redeem', {
      repositories: fakeRepositories(users, fakeLicences([aLicence()])),
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: { code: '  bc-test-0001 ' },
    });

    expect(res.status).toBe(200);
  });

  it('answers an unknown code with 404', async () => {
    const res = await request('/api/licences/redeem', {
      repositories: fakeRepositories(fakeUsers([aUser()]), fakeLicences()),
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: { code: 'BC-NOPE-0000' },
    });

    expect(res.status).toBe(404);
  });

  it("answers someone else's code with 409, not the tier", async () => {
    const licences = fakeLicences([
      aLicence({
        redeemedAt: '2026-01-02T00:00:00.000Z',
        redeemedBy: 'user-2',
      }),
    ]);
    const users = fakeUsers([aUser()]);
    const res = await request('/api/licences/redeem', {
      repositories: fakeRepositories(users, licences),
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: { code: 'BC-TEST-0001' },
    });

    expect(res.status).toBe(409);
    expect(users.rows.get('user-1')?.tier).toBe('free');
  });

  it('is idempotent for the user who already redeemed it', async () => {
    // A double-tapped Redeem button is not something the user can act on, and
    // their tier is already what the code grants.
    const licences = fakeLicences([
      aLicence({
        redeemedAt: '2026-01-02T00:00:00.000Z',
        redeemedBy: 'user-1',
      }),
    ]);
    const res = await request('/api/licences/redeem', {
      repositories: fakeRepositories(
        fakeUsers([aUser({ tier: 'pro' })]),
        licences,
      ),
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: { code: 'BC-TEST-0001' },
    });

    expect(res.status).toBe(200);
  });

  it('rejects a request with no code', async () => {
    const res = await request('/api/licences/redeem', {
      repositories: fakeRepositories(fakeUsers([aUser()]), fakeLicences()),
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: {},
    });

    expect(res.status).toBe(400);
  });
});

describe('the /api/* guard', () => {
  it('protects everything except the session endpoint', async () => {
    const repositories = fakeRepositories();

    const guarded = await request('/api/licences/redeem', {
      repositories,
      method: 'POST',
      body: { code: 'x' },
    });
    const open = await request('/api/session', { repositories });

    expect(guarded.status).toBe(401);
    expect(open.status).toBe(200);
  });

  it('does not let a trailing slash slip past the guard', async () => {
    // The exemption is matched against a path with its trailing slash stripped,
    // so a guarded route cannot be reached by adding one. (`/api/session/`
    // itself 404s — Hono does not alias it onto the mounted `/` — which is
    // harmless: it is the guard, not the router, that this protects.)
    const res = await request('/api/licences/redeem/', {
      repositories: fakeRepositories(),
      method: 'POST',
      body: { code: 'x' },
    });

    expect(res.status).toBe(401);
  });
});
