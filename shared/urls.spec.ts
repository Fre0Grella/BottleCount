import { describe, expect, it } from 'vitest';
import {
  collaboratorUrl,
  inviteUrl,
  linkLabel,
  pathParam,
  shortTicketUrl,
  ticketSlugFromPath,
  ticketUrl,
  withTrailingSlash,
} from './urls';

describe('withTrailingSlash', () => {
  it('ends every base in exactly one slash', () => {
    expect(withTrailingSlash('/')).toBe('/');
    expect(withTrailingSlash('/BottleCount')).toBe('/BottleCount/');
    expect(withTrailingSlash('/BottleCount/')).toBe('/BottleCount/');
  });
});

describe('inviteUrl', () => {
  it('is the origin, the base and the slug', () => {
    expect(inviteUrl('https://bc.example', '/', 'rooftop-k3fq')).toBe(
      'https://bc.example/i/rooftop-k3fq',
    );
    expect(inviteUrl('https://x.io', '/BottleCount', 'rooftop-k3fq')).toBe(
      'https://x.io/BottleCount/i/rooftop-k3fq',
    );
  });

  it("carries a forwarder's token, escaped", () => {
    expect(inviteUrl('https://x.io', '/', 'p-1', 'a b')).toBe(
      'https://x.io/i/p-1?r=a%20b',
    );
    expect(inviteUrl('https://x.io', '/', 'p-1', null)).toBe(
      'https://x.io/i/p-1',
    );
  });

  it('escapes a slug that would break out of the path', () => {
    const url = inviteUrl('https://x.io', '/', 'a/b#c');
    expect(url).toBe('https://x.io/i/a%2Fb%23c');
    expect(pathParam(new URL(url).pathname, '/', 'i')).toBe('a/b#c');
  });
});

describe('collaboratorUrl', () => {
  it('points at /join/ under the base', () => {
    expect(collaboratorUrl('https://x.io', '/BottleCount/', 'tok')).toBe(
      'https://x.io/BottleCount/join/tok',
    );
  });

  // CoOrganisersModal used to pass `location.host` and stick `https://` on the
  // front, which copied a dead link on http://localhost.
  it('keeps the scheme of the origin it is given', () => {
    const url = collaboratorUrl('http://localhost:4321', '/', 'tok');
    expect(url).toBe('http://localhost:4321/join/tok');
    expect(linkLabel(url)).toBe('localhost:4321/join/tok');
  });
});

describe('linkLabel', () => {
  it('drops the scheme and nothing else', () => {
    expect(linkLabel('https://bc.example/i/p-1?r=x')).toBe(
      'bc.example/i/p-1?r=x',
    );
    expect(linkLabel('http://localhost:4321/i/p')).toBe('localhost:4321/i/p');
  });
});

describe('pathParam', () => {
  it('reads the key back under any base', () => {
    expect(pathParam('/i/rooftop-k3fq', '/', 'i')).toBe('rooftop-k3fq');
    expect(pathParam('/BottleCount/join/tok', '/BottleCount/', 'join')).toBe(
      'tok',
    );
    expect(pathParam('/BottleCount/join/tok', '/BottleCount', 'join')).toBe(
      'tok',
    );
  });

  it('is empty on another route or a bare one', () => {
    expect(pathParam('/join/tok', '/', 'i')).toBe('');
    expect(pathParam('/i/', '/', 'i')).toBe('');
  });

  it('is empty, not a crash, on a mangled escape', () => {
    expect(pathParam('/i/abc%', '/', 'i')).toBe('');
  });
});

describe('ticket links', () => {
  const SLUG = 'k3fq9zpx2m7a';

  it('short ones are the origin, the base and the slug', () => {
    expect(shortTicketUrl('https://bc.example', '/', SLUG)).toBe(
      `https://bc.example/t/${SLUG}`,
    );
    expect(shortTicketUrl('https://x.io', '/BottleCount', SLUG)).toBe(
      `https://x.io/BottleCount/t/${SLUG}`,
    );
  });

  it('long ones sit under the base with everything in the fragment', () => {
    const url = new URL(
      ticketUrl('https://x.io', '/BottleCount', 'a.b', {
        party: 'P',
        date: '2026-10-01',
        cover: 1,
      }),
    );
    expect(url.pathname).toBe('/BottleCount/t/');
    expect(url.search).toBe('');
    expect(url.hash).toContain('t=a.b');
  });

  it('read their slug back off the path', () => {
    expect(ticketSlugFromPath(`/t/${SLUG}`, '/')).toBe(SLUG);
    expect(ticketSlugFromPath(`/t/${SLUG}/`, '/')).toBe(SLUG);
    expect(ticketSlugFromPath(`/BottleCount/t/${SLUG}`, '/BottleCount/')).toBe(
      SLUG,
    );
  });

  it('find no slug on the bare page the long links use', () => {
    expect(ticketSlugFromPath('/t/', '/')).toBe('');
  });

  it('find no slug in something that is not one', () => {
    expect(ticketSlugFromPath('/t/xqk8', '/')).toBe('');
    expect(ticketSlugFromPath('/t/../../etc', '/')).toBe('');
    expect(ticketSlugFromPath(`/t/${SLUG}/extra`, '/')).toBe('');
  });
});
