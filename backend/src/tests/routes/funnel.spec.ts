import { beforeEach, describe, expect, it } from 'vitest';
import type {
  HostInviteDTO,
  InviteOpenDTO,
  PublishedPartyDTO,
} from '../../../../shared/invites';
import type { Repositories } from '../../repositories/repositories';
import { resetFakeIds } from '../support/fakeInvites';
import { aUser, fakeUsers } from '../support/fakeRepositories';
import {
  aDocument,
  publishAndOpenInvites,
  repositoriesWith,
} from '../support/party';
import { request, sessionCookie } from '../support/harness';

let repositories: Repositories;
let party: PublishedPartyDTO;
let partyId: string;

beforeEach(async () => {
  resetFakeIds();
  repositories = repositoriesWith();
  const published = await publishAndOpenInvites(
    repositories,
    'user-1',
    aDocument({ venue: { place: '', city: '', time: '21:00' } }),
  );
  partyId = published.party.id;
  party = {
    id: published.party.id,
    slug: published.slug,
    rootToken: published.rootToken,
    publishedAt: published.party.updatedAt,
    allowForward: true,
  };
});

/** Opens the link (optionally as a forward) and confirms, returning the guest. */
async function guestConfirms(
  name: string,
  referrer?: string | null,
): Promise<InviteOpenDTO> {
  const openRes = await request(`/invite/${party.slug}/open`, {
    repositories,
    method: 'POST',
    body: { referrer: referrer ?? null },
  });
  const opened = (await openRes.json()) as InviteOpenDTO;

  const answerRes = await request(`/invite/${party.slug}/answer`, {
    repositories,
    method: 'POST',
    body: { inviteId: opened.inviteId, name, answer: 'confirmed' },
  });
  return (await answerRes.json()) as InviteOpenDTO;
}

async function funnel(): Promise<HostInviteDTO[]> {
  const res = await request(`/api/parties/${partyId}/invites`, {
    repositories,
    cookie: await sessionCookie('user-1'),
  });
  expect(res.status).toBe(200);
  const body = (await res.json()) as { invites: HostInviteDTO[] };
  return body.invites;
}

describe('depth', () => {
  it("puts a guest from the host's own link at depth 0", async () => {
    // Depth 0 is the "Direct invites" tier in the spread card.
    const guest = await guestConfirms('Giulia', party.rootToken);
    expect(guest.depth).toBe(0);
  });

  it("treats no referrer at all as the host's link", async () => {
    const guest = await guestConfirms('Giulia');
    expect(guest.depth).toBe(0);
  });

  it('puts a friend of a guest at depth 1', async () => {
    const giulia = await guestConfirms('Giulia', party.rootToken);
    const marco = await guestConfirms('Marco', giulia.forwardToken);

    expect(marco.depth).toBe(1);
  });

  it('keeps counting down the chain', async () => {
    const giulia = await guestConfirms('Giulia', party.rootToken);
    const marco = await guestConfirms('Marco', giulia.forwardToken);
    const sara = await guestConfirms('Sara', marco.forwardToken);

    expect(sara.depth).toBe(2);
  });

  it('falls back to depth 0 for a token that means nothing', async () => {
    // Usually a link from a party that has since been unpublished. The guest
    // should still be able to RSVP rather than hit an error.
    const guest = await guestConfirms('Giulia', 'not-a-real-token');
    expect(guest.depth).toBe(0);
  });

  it('records who referred whom, by name', async () => {
    const giulia = await guestConfirms('Giulia', party.rootToken);
    await guestConfirms('Marco', giulia.forwardToken);

    const rows = await funnel();
    const marco = rows.find((i) => i.name === 'Marco');
    expect(marco?.referrer).toBe('Giulia');
    expect(rows.find((i) => i.name === 'Giulia')?.referrer).toBeNull();
  });
});

describe("the host's funnel", () => {
  it('reports every state, including people who never answered', async () => {
    await guestConfirms('Giulia', party.rootToken);

    // Someone who opened and said no.
    const declining = await request(`/invite/${party.slug}/open`, {
      repositories,
      method: 'POST',
      body: {},
    });
    const declined = (await declining.json()) as InviteOpenDTO;
    await request(`/invite/${party.slug}/answer`, {
      repositories,
      method: 'POST',
      body: { inviteId: declined.inviteId, name: 'Marco', answer: 'declined' },
    });

    // Someone who opened and walked away.
    await request(`/invite/${party.slug}/open`, {
      repositories,
      method: 'POST',
      body: {},
    });

    const rows = await funnel();
    expect(rows).toHaveLength(3);
    expect(rows.map((i) => i.status).sort()).toEqual([
      'confirmed',
      'declined',
      'opened',
    ]);
    // The one who never answered has no name to show — that is the point of
    // "reached" being a separate number from "confirmed".
    expect(rows.find((i) => i.status === 'opened')?.name).toBeNull();
  });

  it('returns invites oldest first', async () => {
    await guestConfirms('First', party.rootToken);
    await guestConfirms('Second', party.rootToken);

    const rows = await funnel();
    expect(rows.map((i) => i.name)).toEqual(['First', 'Second']);
  });

  it('404s a party that does not exist', async () => {
    const res = await request('/api/parties/party-nope/invites', {
      repositories,
      cookie: await sessionCookie('user-1'),
    });
    expect(res.status).toBe(404);
  });

  it("does not show one host another host's guests", async () => {
    // The lookup is by (owner, localId), so there is no id to substitute.
    await guestConfirms('Giulia', party.rootToken);
    repositories.users = fakeUsers([
      aUser({ tier: 'pro' }),
      aUser({ id: 'user-2', email: 'other@example.com', tier: 'pro' }),
    ]);

    const res = await request(`/api/parties/${partyId}/invites`, {
      repositories,
      cookie: await sessionCookie('user-2'),
    });

    expect(res.status).toBe(404);
  });

  it('stays readable to a member whose tier has changed', async () => {
    // The paywall is on *creating* a cloud party, not on running one. A member
    // of a party that already exists keeps access to it — anything else would
    // strand a co-organiser, who is never required to pay at all.
    repositories.users = fakeUsers([aUser({ tier: 'free' })]);

    const res = await request(`/api/parties/${partyId}/invites`, {
      repositories,
      cookie: await sessionCookie('user-1'),
    });

    expect(res.status).toBe(200);
  });

  it('is refused to someone who is not a member, whatever their tier', async () => {
    const res = await request(`/api/parties/${partyId}/invites`, {
      repositories,
      cookie: await sessionCookie('stranger'),
    });

    expect(res.status).toBe(404);
  });
});

describe('the host overriding an answer', () => {
  async function override(
    inviteId: string,
    status: string,
    cookie = 'user-1',
  ): Promise<Response> {
    return request(`/api/parties/${partyId}/invites/${inviteId}`, {
      repositories,
      cookie: await sessionCookie(cookie),
      method: 'PATCH',
      body: { status },
    });
  }

  it('marks someone who never answered as coming', async () => {
    // Hosts hear from guests off-platform. Without this the funnel would poll
    // the host's change straight back out again.
    const openRes = await request(`/invite/${party.slug}/open`, {
      repositories,
      method: 'POST',
      body: {},
    });
    const opened = (await openRes.json()) as InviteOpenDTO;

    const res = await override(opened.inviteId, 'confirmed');

    expect(res.status).toBe(200);
    expect((await funnel())[0]?.status).toBe('confirmed');
  });

  it('can send a guest back to unanswered, clearing the answer time', async () => {
    const guest = await guestConfirms('Giulia', party.rootToken);
    await override(guest.inviteId, 'opened');

    const row = (await funnel())[0];
    expect(row?.status).toBe('opened');
    expect(row?.answeredAt).toBeNull();
  });

  it('ignores capacity — the host is the authority on their own door', async () => {
    await request('/api/parties', {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: {
        localId: 7,
        document: aDocument({
          settings: { ...aDocument().settings, max_capacity: 1 },
        }),
      },
    });
    await guestConfirms('Giulia', party.rootToken);

    const openRes = await request(`/invite/${party.slug}/open`, {
      repositories,
      method: 'POST',
      body: {},
    });
    const second = (await openRes.json()) as InviteOpenDTO;

    // The guest cannot get in…
    const guestTry = await request(`/invite/${party.slug}/answer`, {
      repositories,
      method: 'POST',
      body: { inviteId: second.inviteId, name: 'Marco', answer: 'confirmed' },
    });
    expect(guestTry.status).toBe(409);

    // …but the host can let them.
    expect((await override(second.inviteId, 'confirmed')).status).toBe(200);
  });

  it('rejects a status that is not a real one', async () => {
    const guest = await guestConfirms('Giulia', party.rootToken);
    expect((await override(guest.inviteId, 'maybe')).status).toBe(400);
  });

  it("404s an invite belonging to someone else's party", async () => {
    const guest = await guestConfirms('Giulia', party.rootToken);
    repositories.users = fakeUsers([
      aUser({ tier: 'pro' }),
      aUser({ id: 'user-2', email: 'other@example.com', tier: 'pro' }),
    ]);

    expect((await override(guest.inviteId, 'declined', 'user-2')).status).toBe(
      404,
    );
  });
});
