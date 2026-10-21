import { beforeEach, describe, expect, it } from 'vitest';
import type { SharedPartyDTO } from '../../../../shared/collab';
import { featuresFor } from '../../../../shared/tiers';
import type { Repositories } from '../../repositories/repositories';
import { resetFakeIds } from '../support/fakeInvites';
import { aUser, fakeUsers } from '../support/fakeRepositories';
import {
  aDocument,
  publishAndOpenInvites,
  repositoriesWith,
} from '../support/party';
import { request, sessionCookie } from '../support/harness';

/**
 * #7: a party carries its owner's features. Anna is Pro and owns the party;
 * Bruno is free and co-organises it.
 */
let repositories: Repositories;
let users: ReturnType<typeof fakeUsers>;
let partyId: string;

beforeEach(async () => {
  resetFakeIds();
  users = fakeUsers([
    aUser({ id: 'user-1', email: 'anna@example.com', tier: 'pro' }),
    aUser({ id: 'user-2', email: 'bruno@example.com', tier: 'free' }),
  ]);
  repositories = repositoriesWith(users);
  const published = await publishAndOpenInvites(
    repositories,
    'user-1',
    aDocument(),
  );
  partyId = published.party.id;

  const invite = await request(`/api/parties/${partyId}/members/invite`, {
    repositories,
    cookie: await sessionCookie('user-1'),
    method: 'POST',
  });
  const { token } = (await invite.json()) as { token: string };
  await request(`/api/collaborate/${token}`, {
    repositories,
    cookie: await sessionCookie('user-2'),
    method: 'POST',
  });
});

async function partyAs(userId: string): Promise<SharedPartyDTO> {
  const res = await request(`/api/parties/${partyId}`, {
    repositories,
    cookie: await sessionCookie(userId),
  });
  expect(res.status).toBe(200);
  return (await res.json()) as SharedPartyDTO;
}

describe("a party's features", () => {
  it('are the owner’s, even when a free co-organiser asks', async () => {
    expect((await partyAs('user-2')).features).toEqual(featuresFor('pro'));
  });

  it('follow the owner when their plan changes', async () => {
    // A refund: the owner's row goes back to free.
    const anna = users.rows.get('user-1')!;
    users.rows.set('user-1', { ...anna, tier: 'free' });

    expect((await partyAs('user-2')).features).toEqual(featuresFor('free'));
  });

  it('come back when the party is first stored', async () => {
    const res = await request('/api/parties', {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: { localId: 2, document: aDocument({ name: 'Second' }) },
    });

    expect(((await res.json()) as SharedPartyDTO).features).toEqual(
      featuresFor('pro'),
    );
  });
});

describe('what a free co-organiser can do on a Pro party', () => {
  // The audit #7 asked for: no member route checks the caller's tier, so the
  // Pro features of the party work for a free co-organiser on the server too.
  it('opens the invite link', async () => {
    const res = await request(`/api/parties/${partyId}/invite-link`, {
      repositories,
      cookie: await sessionCookie('user-2'),
      method: 'POST',
    });
    expect(res.status).toBe(200);
  });

  it('reads the RSVP funnel', async () => {
    const res = await request(`/api/parties/${partyId}/invites`, {
      repositories,
      cookie: await sessionCookie('user-2'),
    });
    expect(res.status).toBe(200);
  });

  it('still cannot store a cloud party of their own', async () => {
    const res = await request('/api/parties', {
      repositories,
      cookie: await sessionCookie('user-2'),
      method: 'POST',
      body: { localId: 1, document: aDocument({ name: 'Mine' }) },
    });
    expect(res.status).toBe(403);
  });
});
