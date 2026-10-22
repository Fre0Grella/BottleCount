import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  answerInvite,
  checkInRemote,
  earlierCheckIn,
  fetchFunnel,
  openInvite,
  setRemoteInviteStatus,
  setRemotePaid,
} from './guests';
import { errorCode, isNotFound } from './request';
import { fakeWorker, sent } from './testing';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api/guests', () => {
  it('unwraps the funnel', async () => {
    const fake = fakeWorker({ json: { invites: [{ id: 'i1' }] } });
    expect(await fetchFunnel('p1')).toEqual({
      ok: true,
      value: [{ id: 'i1' }],
    });
    expect(sent(fake)).toMatchObject({
      method: 'GET',
      path: '/api/parties/p1/invites',
    });
  });

  it("surfaces the server's code where it used to keep only the status", async () => {
    fakeWorker({ status: 403, json: { error: 'forbidden' } });
    const funnel = await fetchFunnel('p1');
    const status = await setRemoteInviteStatus('p1', 'i1', 'declined');
    for (const result of [funnel, status]) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(errorCode(result.error)).toBe('forbidden');
    }
  });

  it('sends the status override as a PATCH', async () => {
    const fake = fakeWorker({ status: 204, text: null });
    await setRemoteInviteStatus('p1', 'i1', 'declined');
    expect(sent(fake)).toEqual({
      method: 'PATCH',
      path: '/api/parties/p1/invites/i1',
      body: { status: 'declined' },
    });
  });

  it('marks paid with POST and unpaid with DELETE', async () => {
    const fake = fakeWorker({ json: { id: 'i1' } });
    await setRemotePaid('p1', 'i1', true);
    await setRemotePaid('p1', 'i1', false);
    expect([sent(fake, 0).method, sent(fake, 1).method]).toEqual([
      'POST',
      'DELETE',
    ]);
    expect(sent(fake).path).toBe('/api/parties/p1/invites/i1/paid');
  });

  it('reads the earlier check-in time off a refused check-in', async () => {
    fakeWorker({
      status: 409,
      json: { error: 'already_checked_in', checkedInAt: '2026-10-22T21:05Z' },
    });
    const result = await checkInRemote('p1', 'i1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(earlierCheckIn(result.error)).toEqual({ at: '2026-10-22T21:05Z' });
    }
  });

  it('finds no earlier check-in in any other failure', () => {
    expect(earlierCheckIn({ kind: 'network' })).toBeNull();
    expect(
      earlierCheckIn({
        kind: 'http',
        status: 404,
        code: 'invite_not_found',
        body: null,
      }),
    ).toBeNull();
    expect(
      earlierCheckIn({
        kind: 'http',
        status: 409,
        code: 'already_checked_in',
        body: {},
      }),
    ).toEqual({ at: null });
  });

  it('reports a closed invite link as not found', async () => {
    // The server says `party_not_found`; the invite page used to look for
    // `http_404` and showed a generic error instead of "this link is closed".
    fakeWorker({ status: 404, json: { error: 'party_not_found' } });
    const result = await openInvite('slug', { referrer: null, inviteId: null });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(isNotFound(result.error)).toBe(true);
  });

  it("posts a guest's answer with their contact", async () => {
    const fake = fakeWorker({ json: { inviteId: 'i1' } });
    await answerInvite('s 1', {
      inviteId: 'i1',
      name: 'Ada',
      answer: 'confirmed',
      email: 'ada@example.com',
    });
    expect(sent(fake)).toEqual({
      method: 'POST',
      path: '/invite/s%201/answer',
      body: {
        inviteId: 'i1',
        name: 'Ada',
        answer: 'confirmed',
        email: 'ada@example.com',
      },
    });
  });
});
