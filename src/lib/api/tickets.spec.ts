import { afterEach, describe, expect, it, vi } from 'vitest';
import { isNotFound } from './request';
import { fakeWorker, sent, type FakeAnswer } from './testing';
import { fetchTicketLink, storeTicketLink } from './tickets';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('storeTicketLink', () => {
  it('returns the slug', async () => {
    const fake = fakeWorker({ json: { slug: 'abc123' } });
    expect(await storeTicketLink('p1', 'i1', 'signed')).toEqual({
      ok: true,
      value: 'abc123',
    });
    expect(sent(fake)).toEqual({
      method: 'PUT',
      path: '/api/parties/p1/invites/i1/ticket',
      body: { signed: 'signed' },
    });
  });

  it('calls an answer without a slug a bad response, not an unexplained failure', async () => {
    fakeWorker({ json: {} });
    expect(await storeTicketLink('p1', 'i1', 'signed')).toEqual({
      ok: false,
      error: { kind: 'bad_response' },
    });
  });
});

describe('fetchTicketLink', () => {
  /**
   * The ticket page forgets its cached copy only when the server says the link
   * is gone. Every other failure — offline at the door, a 500, an HTML page
   * where the JSON should be — reopens the copy kept on the phone.
   */
  const forgets = async (answer: FakeAnswer): Promise<boolean> => {
    fakeWorker(answer);
    const result = await fetchTicketLink('abc123');
    return !result.ok && isNotFound(result.error);
  };

  it('forgets a link the server says is gone', async () => {
    expect(
      await forgets({ status: 404, json: { error: 'ticket_not_found' } }),
    ).toBe(true);
  });

  it('keeps the cached copy when offline, on a 500 or on a non-JSON page', async () => {
    expect(await forgets('offline')).toBe(false);
    expect(await forgets({ status: 500, text: 'oops' })).toBe(false);
    expect(await forgets({ text: '<!doctype html>' })).toBe(false);
  });

  it('reads the ticket', async () => {
    const fake = fakeWorker({ json: { signed: 'x.y' } });
    expect(await fetchTicketLink('a b')).toEqual({
      ok: true,
      value: { signed: 'x.y' },
    });
    expect(sent(fake)).toMatchObject({ method: 'GET', path: '/ticket/a%20b' });
  });
});
