import { describe, expect, it } from 'vitest';
import { fakeRepositories } from '../support/fakeRepositories';
import { request } from '../support/harness';

describe('POST /auth/dev', () => {
  it('is absent on the hosted deployment', async () => {
    // The check reads a binding, not a header, so no caller can talk their way
    // into it. Losing this is a free account on the paid deployment.
    const res = await request('/auth/dev', {
      repositories: fakeRepositories(),
      env: { ENVIRONMENT: 'production', SELF_HOSTED: 'false' },
      method: 'POST',
      body: { email: 'someone@example.com' },
    });

    expect(res.status).toBe(404);
  });

  it('signs a user in on a self-hosted deployment', async () => {
    const res = await request('/auth/dev', {
      repositories: fakeRepositories(),
      env: { ENVIRONMENT: 'production', SELF_HOSTED: 'true' },
      method: 'POST',
      body: { email: 'owner@example.com', name: 'Owner' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toContain('session_token=');
  });

  it('signs a user in locally', async () => {
    const res = await request('/auth/dev', {
      repositories: fakeRepositories(),
      env: { ENVIRONMENT: 'local', SELF_HOSTED: 'false' },
      method: 'POST',
      body: { email: 'dev@example.com' },
    });

    expect(res.status).toBe(200);
  });

  it('requires an email', async () => {
    const res = await request('/auth/dev', {
      repositories: fakeRepositories(),
      env: { ENVIRONMENT: 'local' },
      method: 'POST',
      body: {},
    });

    expect(res.status).toBe(400);
  });

  it('marks the session cookie httpOnly', async () => {
    const res = await request('/auth/dev', {
      repositories: fakeRepositories(),
      env: { ENVIRONMENT: 'local' },
      method: 'POST',
      body: { email: 'dev@example.com' },
    });

    expect(res.headers.get('set-cookie')?.toLowerCase()).toContain('httponly');
  });
});
