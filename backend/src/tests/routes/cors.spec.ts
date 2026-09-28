import { describe, expect, it } from 'vitest';
import { fakeRepositories } from '../support/fakeRepositories';
import { request } from '../support/harness';

// The harness's FRONTEND_URL is http://localhost:4321.
const FRONTEND = 'http://localhost:4321';

describe('CORS', () => {
  it('grants nothing to a foreign origin', async () => {
    // Reflecting any origin with credentials would let every website read the
    // API as the signed-in user the moment the cookie stopped being SameSite.
    const res = await request('/api/session', {
      repositories: fakeRepositories(),
      headers: { origin: 'https://evil.example' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('refuses a foreign preflight', async () => {
    const res = await request('/api/licences/redeem', {
      repositories: fakeRepositories(),
      method: 'OPTIONS',
      headers: {
        origin: 'https://evil.example',
        'access-control-request-method': 'POST',
      },
    });

    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it("allows the frontend's own origin, with credentials", async () => {
    const res = await request('/api/session', {
      repositories: fakeRepositories(),
      headers: { origin: FRONTEND },
    });

    expect(res.headers.get('access-control-allow-origin')).toBe(FRONTEND);
    expect(res.headers.get('access-control-allow-credentials')).toBe('true');
  });

  it('matches the origin exactly, not by prefix', async () => {
    // A lookalike host must not pass because it starts with the real one.
    const res = await request('/api/session', {
      repositories: fakeRepositories(),
      headers: { origin: `${FRONTEND}.evil.example` },
    });

    expect(res.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('follows FRONTEND_URL rather than a hard-coded host', async () => {
    const res = await request('/api/session', {
      repositories: fakeRepositories(),
      env: { FRONTEND_URL: 'https://bottlecount-epj.pages.dev/' },
      headers: { origin: 'https://bottlecount-epj.pages.dev' },
    });

    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://bottlecount-epj.pages.dev',
    );
  });
});
