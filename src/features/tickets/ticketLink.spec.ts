import { describe, expect, it } from 'vitest';
import type { TicketQRPayload } from '../../../shared/tickets';
import { ticketUrl } from '../../../shared/urls';
import { openTicket, parseTicketHash } from './ticketLink';

const payload: TicketQRPayload = {
  code: 'AB23C',
  partyId: '5f4c-abc',
  guestName: 'Zoë Rossi',
  expiresAt: '2026-10-02T04:00:00.000Z',
};

// Shaped like crypto.ts's output: base64 JSON, a dot, a base64 signature. The
// signature deliberately contains `+`, `/` and `=`, which a URL mangles unless
// they are escaped.
const signed = `${btoa(JSON.stringify(payload))}.q3E1+n0e8/uTOwq2QeYz6o0s=`;

const display = { party: 'Rooftop & Friends', date: '2026-10-01', cover: 3 };

function hashOf(url: string): string {
  return new URL(url).hash;
}

describe('ticketUrl', () => {
  it('puts the ticket in the fragment, never the path or query', () => {
    // A fragment is not sent to any server, so the guest's name stays between
    // the host's phone and the guest's.
    const url = new URL(ticketUrl('https://app.test', '/', signed, display));

    expect(url.pathname).toBe('/t/');
    expect(url.search).toBe('');
    expect(url.hash).not.toBe('');
  });

  it('keeps the base path', () => {
    const url = ticketUrl('https://x.test', '/BottleCount', signed, display);
    expect(url.startsWith('https://x.test/BottleCount/t/#')).toBe(true);
  });
});

describe('parseTicketHash', () => {
  it('round-trips the signed string exactly, + / = included', () => {
    // The door verifies this byte for byte; one mangled character is a
    // rejected ticket at the door.
    const opened = parseTicketHash(
      hashOf(ticketUrl('https://app.test', '/', signed, display)),
    );

    expect(opened?.signed).toBe(signed);
  });

  it('reads the guest and code out of the payload, accents included', () => {
    const opened = parseTicketHash(
      hashOf(ticketUrl('https://app.test', '/', signed, display)),
    );

    expect(opened?.payload).toEqual(payload);
  });

  it('carries the display fields, including characters that need escaping', () => {
    const opened = parseTicketHash(
      hashOf(
        ticketUrl('https://app.test', '/', signed, {
          ...display,
          time: '21:30',
        }),
      ),
    );

    expect(opened).toMatchObject({
      party: 'Rooftop & Friends',
      date: '2026-10-01',
      cover: 3,
      time: '21:30',
    });
  });

  it('refuses a link with no ticket', () => {
    expect(parseTicketHash('')).toBeNull();
    expect(parseTicketHash('#p=Rooftop')).toBeNull();
  });

  it('refuses a truncated or mangled ticket', () => {
    const half = signed.slice(0, 20);
    expect(parseTicketHash(`#t=${encodeURIComponent(half)}`)).toBeNull();
    expect(parseTicketHash('#t=not-base64.sig')).toBeNull();
    expect(
      parseTicketHash(`#t=${encodeURIComponent(`${btoa('{"code":1}')}.sig`)}`),
    ).toBeNull();
  });

  it('falls back to the first cover for a nonsense index', () => {
    const url = ticketUrl('https://app.test', '/', signed, display).replace(
      'c=3',
      'c=-2',
    );
    expect(parseTicketHash(hashOf(url))?.cover).toBe(0);
  });
});

describe('openTicket', () => {
  it('opens what a short link served, the same as a fragment link', () => {
    const payload = {
      code: 'AB23C',
      partyId: 'p1',
      guestName: 'Giulia',
      expiresAt: '2026-11-15T05:00:00.000Z',
    };
    const signed = `${btoa(JSON.stringify(payload))}.${btoa('sig')}`;
    const display = {
      party: 'Rooftop',
      date: '2026-11-14',
      cover: 2,
      time: '21:00',
    };

    const fromServer = openTicket(signed, display);
    const fromFragment = parseTicketHash(
      new URL(ticketUrl('https://x.io', '/', signed, display)).hash,
    );

    expect(fromServer).toEqual(fromFragment);
    expect(fromServer?.signed).toBe(signed);
  });

  it('keeps a short link’s banner token, and drops one that is not a token', () => {
    const banner = 'abcdefghjkmnpqrstvwx';
    expect(openTicket(signed, { ...display, banner })?.banner).toBe(banner);
    expect(
      openTicket(signed, { ...display, banner: '../../secret' }),
    ).not.toHaveProperty('banner');
  });
});
