import { beforeEach, describe, expect, it } from 'vitest';
import type { SharedPartyDTO } from '../../../../shared/collab';
import type { HostInviteDTO, InviteOpenDTO } from '../../../../shared/invites';
import { isTicketCode } from '../../../../shared/tickets';
import type { Repositories } from '../../repositories/repositories';
import { resetFakeIds } from '../support/fakeInvites';
import { aUser, fakeUsers } from '../support/fakeRepositories';
import {
  aDocument,
  publishAndOpenInvites,
  repositoriesWith,
} from '../support/party';
import { request, sessionCookie } from '../support/harness';

/** Anna owns the party; Bruno co-organises and works the other door. */
function twoOrganisers() {
  return fakeUsers([
    aUser({
      id: 'user-1',
      email: 'anna@example.com',
      name: 'Anna',
      tier: 'pro',
    }),
    aUser({
      id: 'user-2',
      email: 'bruno@example.com',
      name: 'Bruno',
      tier: 'free',
    }),
  ]);
}

let repositories: Repositories;
let partyId: string;
let slug: string;
let rootToken: string;

beforeEach(async () => {
  resetFakeIds();
  repositories = repositoriesWith(twoOrganisers());
  const published = await publishAndOpenInvites(
    repositories,
    'user-1',
    aDocument(),
  );
  partyId = published.party.id;
  slug = published.slug;
  rootToken = published.rootToken;

  // Bruno joins as a co-organiser.
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

async function aConfirmedGuest(name: string): Promise<HostInviteDTO> {
  const openRes = await request(`/invite/${slug}/open`, {
    repositories,
    method: 'POST',
    body: { referrer: rootToken },
  });
  const opened = (await openRes.json()) as InviteOpenDTO;
  await request(`/invite/${slug}/answer`, {
    repositories,
    method: 'POST',
    body: { inviteId: opened.inviteId, name, answer: 'confirmed' },
  });

  const funnel = await request(`/api/parties/${partyId}/invites`, {
    repositories,
    cookie: await sessionCookie('user-1'),
  });
  const body = (await funnel.json()) as { invites: HostInviteDTO[] };
  return body.invites.find((i) => i.name === name)!;
}

function scan(inviteId: string, as: string): Promise<Response> {
  return sessionCookie(as).then((cookie) =>
    request(`/api/parties/${partyId}/invites/${inviteId}/check-in`, {
      repositories,
      cookie,
      method: 'POST',
    }),
  );
}

describe('the ticket key', () => {
  it('is the same for every organiser', async () => {
    // The whole reason a second phone can check a ticket the first phone
    // issued. A per-device key meant Bruno's scanner rejected every guest.
    const forAnna = await request(`/api/parties/${partyId}`, {
      repositories,
      cookie: await sessionCookie('user-1'),
    });
    const forBruno = await request(`/api/parties/${partyId}`, {
      repositories,
      cookie: await sessionCookie('user-2'),
    });

    const anna = (await forAnna.json()) as SharedPartyDTO;
    const bruno = (await forBruno.json()) as SharedPartyDTO;

    expect(anna.ticketKey).not.toBeNull();
    expect(bruno.ticketKey).toEqual(anna.ticketKey);
  });

  it('survives a save, or every ticket already issued would break', async () => {
    const before = await request(`/api/parties/${partyId}`, {
      repositories,
      cookie: await sessionCookie('user-1'),
    });
    const keyBefore = ((await before.json()) as SharedPartyDTO).ticketKey;

    await request('/api/parties', {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: { localId: 7, document: aDocument({ name: 'Renamed' }) },
    });

    const after = await request(`/api/parties/${partyId}`, {
      repositories,
      cookie: await sessionCookie('user-1'),
    });
    expect(((await after.json()) as SharedPartyDTO).ticketKey).toEqual(
      keyBefore,
    );
  });

  it('is never handed to a guest', async () => {
    const res = await request(`/invite/${slug}/open`, {
      repositories,
      method: 'POST',
      body: {},
    });
    expect(JSON.stringify(await res.json())).not.toContain('ticketKey');
  });
});

describe('ticket codes', () => {
  it('are issued to everyone who opens the link', async () => {
    const guest = await aConfirmedGuest('Giulia');
    expect(isTicketCode(guest.ticketCode)).toBe(true);
  });

  it('are unique within a party', async () => {
    const codes = new Set<string>();
    for (const name of ['A', 'B', 'C', 'D', 'E']) {
      codes.add((await aConfirmedGuest(name)).ticketCode);
    }
    expect(codes.size).toBe(5);
  });
});

describe('a guest an organiser types in', () => {
  it('becomes a real invite the co-organiser can see', async () => {
    // Previously these lived only in the typing browser, so the other organiser
    // never saw them and their ticket could not be checked at the other door.
    const added = await request(`/api/parties/${partyId}/invites`, {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: { name: 'Walk-in Wanda' },
    });
    expect(added.status).toBe(200);

    const res = await request(`/api/parties/${partyId}/invites`, {
      repositories,
      cookie: await sessionCookie('user-2'),
    });
    const body = (await res.json()) as { invites: HostInviteDTO[] };
    const wanda = body.invites.find((i) => i.name === 'Walk-in Wanda');

    expect(wanda).toMatchObject({
      status: 'confirmed',
      source: 'manual',
      depth: 0,
    });
    expect(isTicketCode(wanda!.ticketCode)).toBe(true);
  });

  it('is marked manual, so it does not inflate "reached"', async () => {
    // They never opened a link. Counting them as reached would make the
    // conversion rate a lie.
    await aConfirmedGuest('Giulia');
    await request(`/api/parties/${partyId}/invites`, {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: { name: 'Wanda' },
    });

    const res = await request(`/api/parties/${partyId}/invites`, {
      repositories,
      cookie: await sessionCookie('user-1'),
    });
    const { invites } = (await res.json()) as { invites: HostInviteDTO[] };

    expect(invites.filter((i) => i.source === 'link')).toHaveLength(1);
    expect(invites.filter((i) => i.source === 'manual')).toHaveLength(1);
  });

  it('needs a name', async () => {
    const res = await request(`/api/parties/${partyId}/invites`, {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: { name: '  ' },
    });
    expect(res.status).toBe(400);
  });
});

describe('two phones on the door', () => {
  it('lets the first scan through', async () => {
    const guest = await aConfirmedGuest('Giulia');
    const res = await scan(guest.id, 'user-1');

    expect(res.status).toBe(200);
    expect((await res.json()) as HostInviteDTO).toMatchObject({
      checkedIn: true,
    });
  });

  it('refuses the second, on the other phone', async () => {
    // This is the whole feature. Before, Bruno's phone had its own tally and
    // would have admitted her again.
    const guest = await aConfirmedGuest('Giulia');
    expect((await scan(guest.id, 'user-1')).status).toBe(200);

    const second = await scan(guest.id, 'user-2');

    expect(second.status).toBe(409);
    const body = (await second.json()) as {
      error: string;
      checkedInAt: string;
    };
    expect(body.error).toBe('already_checked_in');
    // The time matters: the door says "already scanned at 23:14", not just no.
    expect(body.checkedInAt).toBeTruthy();
  });

  it('shows the check-in to the other organiser', async () => {
    const guest = await aConfirmedGuest('Giulia');
    await scan(guest.id, 'user-1');

    const res = await request(`/api/parties/${partyId}/invites`, {
      repositories,
      cookie: await sessionCookie('user-2'),
    });
    const { invites } = (await res.json()) as { invites: HostInviteDTO[] };

    expect(invites.find((i) => i.id === guest.id)).toMatchObject({
      checkedIn: true,
    });
  });

  it('can be undone for someone waved through by mistake', async () => {
    const guest = await aConfirmedGuest('Giulia');
    await scan(guest.id, 'user-1');

    const undone = await request(
      `/api/parties/${partyId}/invites/${guest.id}/check-in`,
      { repositories, cookie: await sessionCookie('user-2'), method: 'DELETE' },
    );

    expect(undone.status).toBe(200);
    expect((await undone.json()) as HostInviteDTO).toMatchObject({
      checkedIn: false,
      checkedInAt: null,
    });
    // …and they can then be scanned again.
    expect((await scan(guest.id, 'user-1')).status).toBe(200);
  });

  it('refuses a ticket from another party', async () => {
    const guest = await aConfirmedGuest('Giulia');
    const other = await publishAndOpenInvites(
      repositories,
      'user-1',
      aDocument({ name: 'Other' }),
      9,
    );

    const res = await request(
      `/api/parties/${other.party.id}/invites/${guest.id}/check-in`,
      { repositories, cookie: await sessionCookie('user-1'), method: 'POST' },
    );

    expect(res.status).toBe(404);
  });

  it('refuses a scanner who is not on the party', async () => {
    const guest = await aConfirmedGuest('Giulia');
    const res = await scan(guest.id, 'stranger');

    expect(res.status).toBe(404);
  });
});
