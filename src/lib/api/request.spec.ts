import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  errorCode,
  isNotFound,
  mapResult,
  request,
  type ApiResult,
} from './request';

function respond(body: string | null, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(body, { status })),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('request', () => {
  it('parses a 2xx JSON body', async () => {
    respond(JSON.stringify({ id: 'p1' }));
    expect(await request<{ id: string }>('/api/parties/p1')).toEqual({
      ok: true,
      value: { id: 'p1' },
    });
  });

  it('resolves an empty 2xx body to undefined', async () => {
    respond(null, 204);
    expect(
      await request<void>('/api/parties/p1', { method: 'DELETE' }),
    ).toEqual({ ok: true, value: undefined });
  });

  it('turns a 2xx that is not JSON into bad_response', async () => {
    respond('<!doctype html><title>BottleCount</title>');
    expect(await request('/api/session')).toEqual({
      ok: false,
      error: { kind: 'bad_response' },
    });
  });

  it("keeps the server's error code and body on a 4xx", async () => {
    const body = {
      error: 'already_checked_in',
      checkedInAt: '2026-10-22T21:00Z',
    };
    respond(JSON.stringify(body), 409);
    expect(await request('/api/x', { method: 'POST' })).toEqual({
      ok: false,
      error: { kind: 'http', status: 409, code: 'already_checked_in', body },
    });
  });

  it('reports a 4xx without an error code by status alone', async () => {
    respond(JSON.stringify({ message: 'nope' }), 404);
    const result = await request('/api/x');
    expect(result).toEqual({
      ok: false,
      error: {
        kind: 'http',
        status: 404,
        code: null,
        body: { message: 'nope' },
      },
    });
  });

  it('reports a non-JSON error body by status alone', async () => {
    respond('Bad Gateway', 502);
    expect(await request('/api/x')).toEqual({
      ok: false,
      error: { kind: 'http', status: 502, code: null, body: null },
    });
  });

  it('reports a rejected fetch as a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('offline')));
    expect(await request('/api/x')).toEqual({
      ok: false,
      error: { kind: 'network' },
    });
  });

  it('sends JSON with the session cookie', async () => {
    respond('{}');
    await request('/api/x', { method: 'PUT', body: { a: 1 } });
    expect(fetch).toHaveBeenCalledWith('/api/x', {
      method: 'PUT',
      credentials: 'include',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: '{"a":1}',
    });
  });

  it('sends no body or content type when there is nothing to send', async () => {
    respond('{}');
    await request('/api/x', { method: 'POST' });
    expect(fetch).toHaveBeenCalledWith('/api/x', {
      method: 'POST',
      credentials: 'include',
      headers: { accept: 'application/json' },
    });
  });
});

describe('mapResult', () => {
  it('reshapes a success', () => {
    const result: ApiResult<{ slug: string }> = {
      ok: true,
      value: { slug: 'abc' },
    };
    expect(mapResult(result, (v) => v.slug)).toEqual({
      ok: true,
      value: 'abc',
    });
  });

  it('turns a success missing what was promised into bad_response', () => {
    const result: ApiResult<{ slug?: string }> = { ok: true, value: {} };
    expect(mapResult(result, (v) => v.slug)).toEqual({
      ok: false,
      error: { kind: 'bad_response' },
    });
  });

  it('passes a failure through', () => {
    const result: ApiResult<{ slug: string }> = {
      ok: false,
      error: { kind: 'network' },
    };
    expect(mapResult<{ slug: string }, string>(result, (v) => v.slug)).toBe(
      result,
    );
  });
});

describe('error helpers', () => {
  const notFound = {
    kind: 'http',
    status: 404,
    code: 'party_not_found',
    body: null,
  } as const;

  it('isNotFound reads the status, not the code', () => {
    expect(isNotFound(notFound)).toBe(true);
    expect(isNotFound({ ...notFound, status: 410 })).toBe(false);
    expect(isNotFound({ kind: 'network' })).toBe(false);
  });

  it('errorCode keeps the strings the screens already show', () => {
    expect(errorCode(notFound)).toBe('party_not_found');
    expect(errorCode({ ...notFound, code: null })).toBe('http_404');
    expect(errorCode({ kind: 'network' })).toBe('network_error');
    expect(errorCode({ kind: 'bad_response' })).toBe('bad_response');
  });
});
