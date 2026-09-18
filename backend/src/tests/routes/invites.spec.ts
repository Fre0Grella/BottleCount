import { beforeEach, describe, expect, it } from 'vitest';
import type {
  InviteOpenDTO,
  PublishedPartyDTO,
} from '../../../../shared/invites';
import type { Repositories } from '../../repositories/repositories';
import { fakeInvites, fakeParties, resetFakeIds } from '../support/fakeInvites';
import { aUser, fakeLicences, fakeUsers } from '../support/fakeRepositories';
import { request, sessionCookie } from '../support/harness';

/** A pro host with one published party, and the repositories behind them. */
async function aPublishedParty(
  overrides: { maxCapacity?: number | null; allowForward?: boolean } = {},
): Promise<{ repositories: Repositories; party: PublishedPartyDTO }> {
  const repositories: Repositories = {
    users: fakeUsers([aUser({ tier: 'pro' })]),
    licences: fakeLicences(),
    parties: fakeParties(),
    invites: fakeInvites(),
  };

  const res = await request('/api/parties/publish', {
    repositories,
    cookie: await sessionCookie('user-1'),
    method: 'POST',
    body: {
      localId: 7,
      name: 'Rooftop',
      date: '2026-10-02',
      cover: 1,
      venue: { place: 'The Roof', city: 'Milan', time: '21:00' },
      allowForward: overrides.allowForward ?? true,
      maxCapacity: overrides.maxCapacity ?? null,
    },
  });
  expect(res.status).toBe(200);
  return { repositories, party: (await res.json()) as PublishedPartyDTO };
}

async function open(
  repositories: Repositories,
  slug: string,
  body: Record<string, unknown> = {},
): Promise<InviteOpenDTO> {
  const res = await request(`/invite/${slug}/open`, {
    repositories,
    method: 'POST',
    body,
  });
  expect(res.status).toBe(200);
  return (await res.json()) as InviteOpenDTO;
}

async function answer(
  repositories: Repositories,
  slug: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return request(`/invite/${slug}/answer`, {
    repositories,
    method: 'POST',
    body,
  });
}

beforeEach(() => resetFakeIds());

describe('publishing a party', () => {
  it('refuses a free host', async () => {
    // The paywall is enforced here, not only by hiding the share sheet.
    const repositories: Repositories = {
      users: fakeUsers([aUser({ tier: 'free' })]),
      licences: fakeLicences(),
      parties: fakeParties(),
      invites: fakeInvites(),
    };

    const res = await request('/api/parties/publish', {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: { localId: 1, name: 'Party', date: '2026-10-02' },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ feature: 'inviteLink' });
  });

  it('allows a free host on a self-hosted deployment', async () => {
    const repositories: Repositories = {
      users: fakeUsers([aUser({ tier: 'free' })]),
      licences: fakeLicences(),
      parties: fakeParties(),
      invites: fakeInvites(),
    };

    const res = await request('/api/parties/publish', {
      repositories,
      env: { SELF_HOSTED: 'true' },
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: { localId: 1, name: 'Party', date: '2026-10-02' },
    });

    expect(res.status).toBe(200);
  });

  it('refuses an anonymous caller', async () => {
    const res = await request('/api/parties/publish', {
      repositories: {
        users: fakeUsers(),
        licences: fakeLicences(),
        parties: fakeParties(),
        invites: fakeInvites(),
      },
      method: 'POST',
      body: { localId: 1, name: 'Party', date: '2026-10-02' },
    });

    expect(res.status).toBe(401);
  });

  it('keeps the slug when the host republishes', async () => {
    // Every share-sheet open republishes. A new slug would break every link
    // already sent.
    const { repositories, party } = await aPublishedParty();

    const res = await request('/api/parties/publish', {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: {
        localId: 7,
        name: 'Rooftop (moved)',
        date: '2026-10-09',
        cover: 1,
        venue: { place: 'The Roof', city: 'Milan', time: '22:00' },
        allowForward: true,
        maxCapacity: null,
      },
    });

    const republished = (await res.json()) as PublishedPartyDTO;
    expect(republished.slug).toBe(party.slug);
    expect(republished.rootToken).toBe(party.rootToken);

    // …and the guest-facing card reflects the edit.
    const opened = await open(repositories, party.slug);
    expect(opened.party.name).toBe('Rooftop (moved)');
    expect(opened.party.venue.time).toBe('22:00');
  });

  it('rejects a snapshot with no name', async () => {
    const { repositories } = await aPublishedParty();
    const res = await request('/api/parties/publish', {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: { localId: 8, name: '   ', date: '2026-10-02' },
    });

    expect(res.status).toBe(400);
  });
});

describe('opening an invite link', () => {
  it('records the visit before any answer', async () => {
    // This is what makes "reached" a real number rather than a guess.
    const { repositories, party } = await aPublishedParty();

    const opened = await open(repositories, party.slug);

    expect(opened.status).toBe('opened');
    expect(opened.name).toBeNull();
    expect(opened.depth).toBe(0);
    expect(opened.party.name).toBe('Rooftop');
  });

  it('does not hand out a forward token before confirming', async () => {
    // Otherwise someone who never replied could seed a referral tree.
    const { repositories, party } = await aPublishedParty();
    const opened = await open(repositories, party.slug);

    expect(opened.forwardToken).toBeNull();
  });

  it('treats a returning browser as the same guest', async () => {
    const { repositories, party } = await aPublishedParty();
    const first = await open(repositories, party.slug);
    const second = await open(repositories, party.slug, {
      inviteId: first.inviteId,
    });

    expect(second.inviteId).toBe(first.inviteId);
    const listed = await repositories.invites.listForParty('party-1');
    expect(listed.ok && listed.value).toHaveLength(1);
  });

  it('ignores an inviteId belonging to another party', async () => {
    const { repositories, party } = await aPublishedParty();
    const first = await open(repositories, party.slug);

    // Publish a second party and try to carry the first party's row into it.
    await request('/api/parties/publish', {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: { localId: 9, name: 'Other', date: '2026-11-01' },
    });
    const other = await repositories.parties.findByOwnerAndLocalId('user-1', 9);
    expect(other.ok).toBe(true);
    if (!other.ok) return;

    const opened = await open(repositories, other.value.slug, {
      inviteId: first.inviteId,
    });

    expect(opened.inviteId).not.toBe(first.inviteId);
  });

  it('404s an unknown slug', async () => {
    const { repositories } = await aPublishedParty();
    const res = await request('/invite/not-a-party/open', {
      repositories,
      method: 'POST',
      body: {},
    });

    expect(res.status).toBe(404);
  });

  it('404s once the host unpublishes', async () => {
    const { repositories, party } = await aPublishedParty();

    const removed = await request('/api/parties/7/publish', {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'DELETE',
    });
    expect(removed.status).toBe(200);

    const res = await request(`/invite/${party.slug}/open`, {
      repositories,
      method: 'POST',
      body: {},
    });
    expect(res.status).toBe(404);
  });
});

describe('answering', () => {
  it('confirms and hands back a forward link', async () => {
    const { repositories, party } = await aPublishedParty();
    const opened = await open(repositories, party.slug);

    const res = await answer(repositories, party.slug, {
      inviteId: opened.inviteId,
      name: 'Giulia',
      answer: 'confirmed',
    });

    expect(res.status).toBe(200);
    const dto = (await res.json()) as InviteOpenDTO;
    expect(dto.status).toBe('confirmed');
    expect(dto.name).toBe('Giulia');
    expect(dto.forwardToken).toBeTruthy();
  });

  it('withholds the forward link when the host disallows forwarding', async () => {
    const { repositories, party } = await aPublishedParty({
      allowForward: false,
    });
    const opened = await open(repositories, party.slug);

    const res = await answer(repositories, party.slug, {
      inviteId: opened.inviteId,
      name: 'Giulia',
      answer: 'confirmed',
    });

    const dto = (await res.json()) as InviteOpenDTO;
    expect(dto.forwardToken).toBeNull();
  });

  it('lets a guest change their mind without becoming a second guest', async () => {
    const { repositories, party } = await aPublishedParty();
    const opened = await open(repositories, party.slug);

    await answer(repositories, party.slug, {
      inviteId: opened.inviteId,
      name: 'Giulia',
      answer: 'confirmed',
    });
    const res = await answer(repositories, party.slug, {
      inviteId: opened.inviteId,
      name: 'Giulia',
      answer: 'declined',
    });

    expect(res.status).toBe(200);
    const listed = await repositories.invites.listForParty('party-1');
    expect(listed.ok && listed.value).toHaveLength(1);
    expect(listed.ok && listed.value[0]?.status).toBe('declined');
  });

  it('requires a name', async () => {
    const { repositories, party } = await aPublishedParty();
    const opened = await open(repositories, party.slug);

    const res = await answer(repositories, party.slug, {
      inviteId: opened.inviteId,
      name: '   ',
      answer: 'confirmed',
    });

    expect(res.status).toBe(400);
  });

  it('rejects an answer that is not one of the two', async () => {
    // "opened" is a state, not something a guest can claim.
    const { repositories, party } = await aPublishedParty();
    const opened = await open(repositories, party.slug);

    const res = await answer(repositories, party.slug, {
      inviteId: opened.inviteId,
      name: 'Giulia',
      answer: 'opened',
    });

    expect(res.status).toBe(400);
  });

  it('404s a stale invite id so the client knows to open again', async () => {
    const { repositories, party } = await aPublishedParty();

    const res = await answer(repositories, party.slug, {
      inviteId: 'invite-does-not-exist',
      name: 'Giulia',
      answer: 'confirmed',
    });

    expect(res.status).toBe(404);
  });
});

describe('capacity', () => {
  it('refuses a confirmation once the cap is reached', async () => {
    const { repositories, party } = await aPublishedParty({ maxCapacity: 1 });

    const first = await open(repositories, party.slug);
    await answer(repositories, party.slug, {
      inviteId: first.inviteId,
      name: 'Giulia',
      answer: 'confirmed',
    });

    const second = await open(repositories, party.slug);
    const res = await answer(repositories, party.slug, {
      inviteId: second.inviteId,
      name: 'Marco',
      answer: 'confirmed',
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ error: 'party_full' });
  });

  it('still lets someone decline a full party', async () => {
    // Refusing the decline would strand the row at `opened` and overstate the
    // "maybe" column with people who have already said no.
    const { repositories, party } = await aPublishedParty({ maxCapacity: 1 });

    const first = await open(repositories, party.slug);
    await answer(repositories, party.slug, {
      inviteId: first.inviteId,
      name: 'Giulia',
      answer: 'confirmed',
    });

    const second = await open(repositories, party.slug);
    const res = await answer(repositories, party.slug, {
      inviteId: second.inviteId,
      name: 'Marco',
      answer: 'declined',
    });

    expect(res.status).toBe(200);
  });

  it('lets an already-confirmed guest correct their name at the cap', async () => {
    // They are already counted; re-confirming must not have to fit them in again.
    const { repositories, party } = await aPublishedParty({ maxCapacity: 1 });
    const opened = await open(repositories, party.slug);

    await answer(repositories, party.slug, {
      inviteId: opened.inviteId,
      name: 'Giula',
      answer: 'confirmed',
    });
    const res = await answer(repositories, party.slug, {
      inviteId: opened.inviteId,
      name: 'Giulia',
      answer: 'confirmed',
    });

    expect(res.status).toBe(200);
    expect(((await res.json()) as InviteOpenDTO).name).toBe('Giulia');
  });

  it('tells a late arrival the party is full before they answer', async () => {
    const { repositories, party } = await aPublishedParty({ maxCapacity: 1 });
    const first = await open(repositories, party.slug);
    await answer(repositories, party.slug, {
      inviteId: first.inviteId,
      name: 'Giulia',
      answer: 'confirmed',
    });

    const second = await open(repositories, party.slug);
    expect(second.party.full).toBe(true);
  });
});
