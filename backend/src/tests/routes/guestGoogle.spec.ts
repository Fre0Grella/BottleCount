import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sign } from 'hono/jwt';
import type { InviteOpenDTO } from '../../../../shared/invites';
import { emptyPaymentDetails } from '../../../../shared/payments';
import type { Repositories } from '../../repositories/repositories';
import { resetFakeIds } from '../support/fakeInvites';
import { aUser, fakeUsers } from '../support/fakeRepositories';
import {
  aDocument,
  publishAndOpenInvites,
  repositoriesWith,
} from '../support/party';
import { JWT_SECRET, request } from '../support/harness';

/**
 * #22: "Continue with Google" for a guest. Google's two endpoints are stubbed;
 * what is under test is everything on this side of them.
 */
let repositories: Repositories;
let users: ReturnType<typeof fakeUsers>;
let slug: string;
let inviteId: string;

const PROFILE = {
  sub: 'google-123',
  email: 'Giulia.Rossi@Gmail.com',
  email_verified: true,
  name: 'Giulia Rossi',
};

function stubGoogle(profile: Record<string, unknown> = PROFILE): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string | URL) => {
      const href = String(url);
      if (href.startsWith('https://oauth2.googleapis.com/token')) {
        return Response.json({ access_token: 'access', id_token: 'id' });
      }
      if (href.startsWith('https://openidconnect.googleapis.com/')) {
        return Response.json(profile);
      }
      return new Response('unexpected', { status: 500 });
    }),
  );
}

beforeEach(async () => {
  resetFakeIds();
  users = fakeUsers([aUser({ id: 'user-1', tier: 'pro' })]);
  repositories = repositoriesWith(users);
  const published = await publishAndOpenInvites(
    repositories,
    'user-1',
    aDocument({ payment: { ...emptyPaymentDetails(), paypal: 'anna' } }),
  );
  slug = published.slug;
  const opened = await request(`/invite/${slug}/open`, {
    repositories,
    method: 'POST',
    body: {},
  });
  inviteId = ((await opened.json()) as InviteOpenDTO).inviteId;
  stubGoogle();
});

afterEach(() => vi.unstubAllGlobals());

/** Starts the flow; returns the signed state and this browser's nonce cookie. */
async function start(): Promise<{ state: string; cookie: string }> {
  const res = await request(
    `/auth/guest-google?slug=${slug}&invite=${inviteId}`,
    { repositories },
  );
  expect(res.status).toBe(302);
  const location = new URL(res.headers.get('location')!);
  expect(location.origin).toBe('https://accounts.google.com');
  expect(location.searchParams.get('scope')).toBe('openid email profile');
  const setCookie = res.headers.get('set-cookie') ?? '';
  return {
    state: location.searchParams.get('state')!,
    cookie: setCookie.split(';')[0]!,
  };
}

function callback(state: string, cookie?: string): Promise<Response> {
  return request(
    `/auth/guest-google/callback?code=abc&state=${encodeURIComponent(state)}`,
    { repositories, ...(cookie ? { cookie } : {}) },
  );
}

async function storedEmail(): Promise<string | null> {
  const invite = await repositories.invites.findById(inviteId);
  return invite.ok ? invite.value.email : 'missing';
}

describe('a guest continuing with Google', () => {
  it('lands their verified email on the invite and returns them to it', async () => {
    const { state, cookie } = await start();

    const res = await callback(state, cookie);

    expect(res.status).toBe(302);
    const location = res.headers.get('location')!;
    expect(location).toMatch(
      new RegExp(`^http://localhost:4321/i/${slug}#google=`),
    );
    const fragment = location.split('#google=')[1]!;
    const decoded = JSON.parse(
      atob(fragment.replace(/-/g, '+').replace(/_/g, '/')),
    ) as { name: string; email: string };
    expect(decoded).toEqual({
      name: 'Giulia Rossi',
      email: 'giulia.rossi@gmail.com',
    });
    expect(await storedEmail()).toBe('giulia.rossi@gmail.com');
  });

  it('creates no user and no session', async () => {
    const before = users.rows.size;
    const { state, cookie } = await start();

    const res = await callback(state, cookie);

    expect(users.rows.size).toBe(before);
    expect(res.headers.get('set-cookie') ?? '').not.toContain('session_token');
  });

  it('refuses an email Google has not verified', async () => {
    stubGoogle({ ...PROFILE, email_verified: false });
    const { state, cookie } = await start();

    const res = await callback(state, cookie);

    expect(res.headers.get('location')).toContain('#google_error=email');
    expect(await storedEmail()).toBeNull();
  });
});

describe('the state', () => {
  it('is refused when tampered with', async () => {
    const { state, cookie } = await start();
    const [header, payload, signature] = state.split('.');
    const forged = JSON.parse(atob(payload!)) as Record<string, unknown>;
    forged['inviteId'] = 'someone-elses-invite';
    const tampered = [header, btoa(JSON.stringify(forged)), signature].join(
      '.',
    );

    const res = await callback(tampered, cookie);

    expect(res.status).toBe(400);
    expect(await storedEmail()).toBeNull();
  });

  it('is refused from a browser that did not start the flow', async () => {
    const { state } = await start();

    const res = await callback(state);

    expect(res.status).toBe(400);
    expect(await storedEmail()).toBeNull();
  });

  it('is refused when replayed', async () => {
    const { state, cookie } = await start();
    const first = await callback(state, cookie);
    expect(first.status).toBe(302);
    // The callback spends the nonce: the browser no longer holds it.
    expect(first.headers.get('set-cookie') ?? '').toMatch(
      /guest_google_nonce=;|Max-Age=0/,
    );

    // A second browser replaying the same callback URL, with no nonce.
    const replay = await callback(state);
    expect(replay.status).toBe(400);
  });

  it('is refused once expired', async () => {
    const { cookie } = await start();
    const nonce = cookie.split('=')[1]!;
    const expired = await sign(
      {
        purpose: 'guest-google',
        slug,
        inviteId,
        nonce,
        exp: Math.floor(Date.now() / 1000) - 60,
      },
      `${JWT_SECRET}:guest-google`,
      'HS256',
    );

    expect((await callback(expired, cookie)).status).toBe(400);
  });

  it('is never a session: a host session token is refused as a state', async () => {
    const { cookie } = await start();
    const session = await sign(
      { sub: 'user-1', exp: Math.floor(Date.now() / 1000) + 60 },
      JWT_SECRET,
      'HS256',
    );

    expect((await callback(session, cookie)).status).toBe(400);
  });
});

describe('without a Google client', () => {
  const unconfigured = { GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '' };

  it('tells the invite page not to offer the button', async () => {
    const res = await request(`/invite/${slug}/open`, {
      repositories,
      method: 'POST',
      body: {},
      env: unconfigured,
    });
    expect(((await res.json()) as InviteOpenDTO).party.googleSignIn).toBe(
      false,
    );
  });

  it('offers it when one is configured', async () => {
    const res = await request(`/invite/${slug}/open`, {
      repositories,
      method: 'POST',
      body: {},
    });
    expect(((await res.json()) as InviteOpenDTO).party.googleSignIn).toBe(true);
  });

  it('does not run the flow', async () => {
    const res = await request(
      `/auth/guest-google?slug=${slug}&invite=${inviteId}`,
      { repositories, env: unconfigured },
    );
    expect(res.status).toBe(404);
  });
});

describe('starting the flow', () => {
  it('needs an invite that belongs to the party', async () => {
    const res = await request(
      `/auth/guest-google?slug=${slug}&invite=not-an-invite`,
      { repositories },
    );
    expect(res.headers.get('location')).toContain('#google_error=invite');
  });
});
