import { beforeEach, describe, expect, it } from 'vitest';
import type { SharedPartyDTO } from '../../../../shared/collab';
import type { HostInviteDTO, InviteOpenDTO } from '../../../../shared/invites';
import type { RateLimiter } from '../../appEnv';
import type { Repositories } from '../../repositories/repositories';
import { fakeParties, resetFakeIds } from '../support/fakeInvites';
import { request, sessionCookie } from '../support/harness';
import {
  aDocument,
  publishAndOpenInvites,
  publishParty,
  repositoriesWith,
} from '../support/party';

/**
 * What the shared route plumbing promises every route: the same failure
 * answers the same way, a hidden error stays hidden, and an error that is ours
 * is a 500 rather than the client's fault.
 */

let repositories: Repositories;
let party: SharedPartyDTO;
let slug: string;
let rootToken: string;

beforeEach(async () => {
  resetFakeIds();
  repositories = repositoriesWith();
  ({ party, slug, rootToken } = await publishAndOpenInvites(repositories));
});

async function asHost(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<Response> {
  return request(path, {
    repositories,
    cookie: await sessionCookie('user-1'),
    ...init,
  });
}

async function guestOpens(referrer: string | null): Promise<InviteOpenDTO> {
  const res = await request(`/invite/${slug}/open`, {
    repositories,
    method: 'POST',
    body: { referrer },
  });
  return (await res.json()) as InviteOpenDTO;
}

async function guestConfirms(name: string, referrer: string | null) {
  const opened = await guestOpens(referrer);
  const res = await request(`/invite/${slug}/answer`, {
    repositories,
    method: 'POST',
    body: { inviteId: opened.inviteId, name, answer: 'confirmed' },
  });
  return (await res.json()) as InviteOpenDTO;
}

describe('a guest written to by an organiser', () => {
  // Every write on one guest used to answer with `referrer: null`, and the
  // client folded that into its list — so checking Marco in erased "via
  // Giulia" from the funnel until the next full pull.
  it('keeps who referred them', async () => {
    const giulia = await guestConfirms('Giulia', rootToken);
    const marco = await guestConfirms('Marco', giulia.forwardToken);

    for (const [method, action] of [
      ['POST', 'check-in'],
      ['POST', 'paid'],
      ['PUT', 'contact'],
    ] as const) {
      const res = await asHost(
        `/api/parties/${party.id}/invites/${marco.inviteId}/${action}`,
        { method, body: {} },
      );
      expect(res.status).toBe(200);
      expect(((await res.json()) as HostInviteDTO).referrer).toBe('Giulia');
    }
  });

  it('is not found through another party', async () => {
    const other = await publishParty(
      repositories,
      'user-1',
      aDocument({ name: 'Other' }),
      8,
    );
    const guest = await guestConfirms('Giulia', rootToken);

    const res = await asHost(
      `/api/parties/${other.id}/invites/${guest.inviteId}/check-in`,
      { method: 'POST' },
    );

    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'invite_not_found' });
    const stored = await repositories.invites.findById(guest.inviteId);
    expect(stored.ok && stored.value.checkedIn).toBe(false);
  });

  it('is a 500 when storage fails, not the organiser’s mistake', async () => {
    repositories.invites.addManual = async () => {
      throw new Error('D1_ERROR: network lost');
    };

    const res = await asHost(`/api/parties/${party.id}/invites`, {
      method: 'POST',
      body: { name: 'Giulia' },
    });

    expect(res.status).toBe(500);
  });
});

describe('errors a route hides', () => {
  it('answers a revoked co-organiser link exactly like an unknown one', async () => {
    const minted = await asHost(`/api/parties/${party.id}/members/invite`, {
      method: 'POST',
    });
    const { token } = (await minted.json()) as { token: string };
    await asHost(`/api/parties/${party.id}/members/invites`, {
      method: 'DELETE',
    });

    for (const method of ['GET', 'POST']) {
      for (const link of [token, 'never-minted']) {
        const res = await asHost(`/api/collaborate/${link}`, { method });
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({
          error: 'collaborator_invite_unknown',
        });
      }
    }
  });

  it('answers a closed invite link like a party that does not exist', async () => {
    await asHost(`/api/parties/${party.id}/invite-link`, { method: 'DELETE' });

    for (const link of [slug, 'no-such-party']) {
      const res = await request(`/invite/${link}/open`, {
        repositories,
        method: 'POST',
        body: {},
      });
      expect(res.status).toBe(404);
      expect(await res.json()).toEqual({ error: 'party_not_found' });
    }
  });
});

describe('a party stored before documents existed', () => {
  it('answers 409 to opening or patching it', async () => {
    const parties = repositories.parties as ReturnType<typeof fakeParties>;
    const row = parties.rows.get(party.id)!;
    parties.rows.set(party.id, { ...row, document: null });

    const opened = await asHost(`/api/parties/${party.id}`);
    const patched = await asHost(`/api/parties/${party.id}`, {
      method: 'PATCH',
      body: { baseVersion: 1, patch: { name: 'X' } },
    });

    for (const res of [opened, patched]) {
      expect(res.status).toBe(409);
      expect(await res.json()).toEqual({ error: 'party_has_no_document' });
    }
  });
});

describe('rate limiting', () => {
  const refuseAll: RateLimiter = { limit: async () => ({ success: false }) };

  it('refuses both invite writes before reading the party', async () => {
    for (const path of [`/invite/${slug}/open`, `/invite/nope/answer`]) {
      const res = await request(path, {
        repositories,
        env: { INVITE_RATE_LIMITER: refuseAll },
        method: 'POST',
        body: {},
      });
      expect(res.status).toBe(429);
      expect(await res.json()).toEqual({ error: 'rate_limited' });
    }
  });

  it('refuses a short ticket link through its own limiter', async () => {
    const res = await request('/ticket/abcdefghijkl', {
      repositories,
      env: { TICKET_RATE_LIMITER: refuseAll },
    });
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: 'rate_limited' });
  });

  it('keys on the caller’s address', async () => {
    const keys: string[] = [];
    const recording: RateLimiter = {
      limit: async ({ key }) => {
        keys.push(key);
        return { success: true };
      },
    };

    await request(`/invite/${slug}/open`, {
      repositories,
      env: { INVITE_RATE_LIMITER: recording },
      method: 'POST',
      body: {},
      headers: { 'cf-connecting-ip': '203.0.113.7' },
    });

    expect(keys).toEqual(['203.0.113.7']);
  });
});

describe('the session guard on route groups', () => {
  it('refuses a token that names nobody', async () => {
    const { sign } = await import('hono/jwt');
    const token = await sign(
      { exp: Math.floor(Date.now() / 1000) + 60 },
      'test-secret',
      'HS256',
    );

    for (const path of [
      '/api/parties',
      '/api/collaborate/x',
      '/api/licences/redeem',
    ]) {
      const res = await request(path, {
        repositories,
        cookie: `session_token=${token}`,
        method: path.endsWith('redeem') ? 'POST' : 'GET',
      });
      expect(res.status).toBe(401);
    }
  });
});
