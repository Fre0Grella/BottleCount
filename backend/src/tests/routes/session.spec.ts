import { describe, expect, it } from 'vitest';
import type { SessionDTO } from '../../../../shared/session';
import {
  aUser,
  fakeLicences,
  fakeRepositories,
  fakeUsers,
} from '../support/fakeRepositories';
import { request, sessionCookie } from '../support/harness';

async function getSession(
  options: Parameters<typeof request>[1],
): Promise<SessionDTO> {
  const res = await request('/api/session', options);
  expect(res.status).toBe(200);
  return (await res.json()) as SessionDTO;
}

describe('GET /api/session', () => {
  it('answers anonymous callers instead of rejecting them', async () => {
    // The free tier *is* a logged-out browser. A 401 here would make the
    // browser-only product depend on being signed out successfully.
    const dto = await getSession({ repositories: fakeRepositories() });

    expect(dto.authenticated).toBe(false);
    expect(dto.tier).toBe('free');
    expect(dto.features.inviteLink).toBe(false);
  });

  it('reports the stored tier for a signed-in user', async () => {
    const users = fakeUsers([aUser({ tier: 'pro' })]);
    const dto = await getSession({
      repositories: fakeRepositories(users, fakeLicences()),
      cookie: await sessionCookie('user-1'),
    });

    expect(dto.authenticated).toBe(true);
    expect(dto.tier).toBe('pro');
    expect(dto.features.coOrganizers).toBe(true);
    expect(dto.user?.email).toBe('host@example.com');
  });

  it('degrades an unreadable cookie to anonymous rather than failing', async () => {
    const dto = await getSession({
      repositories: fakeRepositories(),
      cookie: 'session_token=not-a-jwt',
    });

    expect(dto.authenticated).toBe(false);
    expect(dto.tier).toBe('free');
  });

  it('degrades a session whose user no longer exists', async () => {
    const dto = await getSession({
      repositories: fakeRepositories(),
      cookie: await sessionCookie('deleted-user'),
    });

    expect(dto.authenticated).toBe(false);
  });

  it('grants pro to a signed-in user on a self-hosted deployment', async () => {
    const users = fakeUsers([aUser({ tier: 'free' })]);
    const dto = await getSession({
      repositories: fakeRepositories(users, fakeLicences()),
      env: { SELF_HOSTED: 'true' },
      cookie: await sessionCookie('user-1'),
    });

    expect(dto.tier).toBe('pro');
    expect(dto.selfHosted).toBe(true);
  });

  it('still refuses anonymous callers pro when self-hosted', async () => {
    const dto = await getSession({
      repositories: fakeRepositories(),
      env: { SELF_HOSTED: 'true' },
    });

    expect(dto.tier).toBe('free');
    expect(dto.selfHosted).toBe(true);
  });
});

describe('devSignIn', () => {
  // The app offers an email sign-in only where POST /auth/dev would accept it;
  // anywhere else the button would lead to a 404.
  it('is on for local development', async () => {
    const dto = await getSession({
      repositories: fakeRepositories(),
      env: { ENVIRONMENT: 'local' },
    });
    expect(dto.devSignIn).toBe(true);
  });

  it('is on for a self-hosted Worker', async () => {
    const dto = await getSession({
      repositories: fakeRepositories(),
      env: { ENVIRONMENT: 'production', SELF_HOSTED: 'true' },
    });
    expect(dto.devSignIn).toBe(true);
  });

  it('is off on the hosted deployment', async () => {
    const dto = await getSession({
      repositories: fakeRepositories(),
      env: { ENVIRONMENT: 'production', SELF_HOSTED: 'false' },
    });
    expect(dto.devSignIn).toBe(false);
  });
});
