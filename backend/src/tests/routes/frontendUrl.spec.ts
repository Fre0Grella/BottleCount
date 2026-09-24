import { describe, expect, it } from 'vitest';
import { resolveFrontendUrl } from '../../routes/frontendUrl';

const req = (url: string) => new Request(url);

describe('resolveFrontendUrl', () => {
  it('uses the host the request actually arrived on', () => {
    // The Pages Function proxies over a service binding, which preserves the
    // original request — so this is the host the user typed, not a guess.
    expect(
      resolveFrontendUrl(
        { FRONTEND_URL: 'https://stale.example.com' },
        req('https://party.example.com/auth/google'),
      ),
    ).toBe('https://party.example.com');
  });

  it('ignores a stale configured domain entirely', () => {
    // The bug this exists to stop: sign-in landing on whichever domain the
    // config was written for, long after the app moved.
    const resolved = resolveFrontendUrl(
      { FRONTEND_URL: 'https://bottlecount.pages.dev' },
      req('https://bottlecount.app/auth/google'),
    );
    expect(resolved).not.toContain('pages.dev');
  });

  it('always uses https for a public host', () => {
    // A service-binding dispatch is internal and its URL need not carry the
    // scheme the browser used. Getting this wrong means an OAuth redirect_uri
    // Google rejects and a session cookie without `Secure`.
    expect(
      resolveFrontendUrl({}, req('http://party.example.com/auth/google')),
    ).toBe('https://party.example.com');
  });

  it('leaves loopback on whatever scheme it came in on', () => {
    expect(resolveFrontendUrl({}, req('http://localhost:4321/x'))).toBe(
      'http://localhost:4321',
    );
  });

  it('keeps a non-standard port, so a preview deployment works', () => {
    expect(
      resolveFrontendUrl({}, req('https://preview.example.com:8443/x')),
    ).toBe('https://preview.example.com:8443');
  });

  it('falls back to configuration locally, where the ports differ', () => {
    // `wrangler dev` answers on 8787 and Astro on 4321; the request's own
    // origin is the wrong answer by construction.
    expect(
      resolveFrontendUrl(
        { ENVIRONMENT: 'local', FRONTEND_URL: 'http://localhost:4321' },
        req('http://localhost:8787/auth/google'),
      ),
    ).toBe('http://localhost:4321');
  });

  it('falls back on a direct workers.dev hit, which skipped the proxy', () => {
    // That host is the Worker's own. Redirecting a user there is a 404.
    expect(
      resolveFrontendUrl(
        { FRONTEND_URL: 'https://party.example.com' },
        req('https://backend.someone.workers.dev/auth/google'),
      ),
    ).toBe('https://party.example.com');
  });

  it('falls back when there is no request to read', () => {
    expect(
      resolveFrontendUrl({ FRONTEND_URL: 'https://party.example.com' }),
    ).toBe('https://party.example.com');
  });

  it('adds a scheme to a bare host and trims a trailing slash', () => {
    expect(resolveFrontendUrl({ FRONTEND_URL: 'party.example.com/' })).toBe(
      'https://party.example.com',
    );
    expect(resolveFrontendUrl({ FRONTEND_URL: 'localhost:4321' })).toBe(
      'http://localhost:4321',
    );
  });

  it('treats an empty configured value as unset', () => {
    expect(resolveFrontendUrl({ FRONTEND_URL: '' })).toBe(
      'http://localhost:4321',
    );
  });
});
