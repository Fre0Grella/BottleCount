import { beforeEach, describe, expect, it } from 'vitest';
import type {
  CollaboratorInviteDTO,
  CollaboratorPreviewDTO,
  PartySummaryDTO,
  SharedPartyDTO,
} from '../../../../shared/collab';
import type { Repositories } from '../../repositories/repositories';
import { resetFakeIds } from '../support/fakeInvites';
import { aUser, fakeUsers } from '../support/fakeRepositories';
import { aDocument, publishParty, repositoriesWith } from '../support/party';
import { request, sessionCookie } from '../support/harness';

/** An owner and someone they might invite. */
function twoUsers() {
  return fakeUsers([
    aUser({
      id: 'user-1',
      email: 'owner@example.com',
      name: 'Marco',
      tier: 'pro',
    }),
    aUser({
      id: 'user-2',
      email: 'friend@example.com',
      name: 'Giulia',
      tier: 'free',
    }),
  ]);
}

let repositories: Repositories;
let party: SharedPartyDTO;

beforeEach(async () => {
  resetFakeIds();
  repositories = repositoriesWith(twoUsers());
  party = await publishParty(repositories);
});

async function inviteToken(as = 'user-1'): Promise<string> {
  const res = await request(`/api/parties/${party.id}/members/invite`, {
    repositories,
    cookie: await sessionCookie(as),
    method: 'POST',
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as CollaboratorInviteDTO).token;
}

async function join(token: string, as = 'user-2'): Promise<Response> {
  return request(`/api/collaborate/${token}`, {
    repositories,
    cookie: await sessionCookie(as),
    method: 'POST',
  });
}

describe('storing a party', () => {
  it('makes its creator the owner', async () => {
    expect(party.role).toBe('owner');
    expect(party.members).toHaveLength(1);
    expect(party.members[0]).toMatchObject({ userId: 'user-1', role: 'owner' });
  });

  it('does not open the party to guests', async () => {
    // Syncing a party so a co-organiser can open it is not the same act as
    // opening it to the world.
    expect(party.publication).toBeNull();
  });

  it('lists the party for its owner', async () => {
    const res = await request('/api/parties', {
      repositories,
      cookie: await sessionCookie('user-1'),
    });

    const body = (await res.json()) as { parties: PartySummaryDTO[] };
    expect(body.parties).toHaveLength(1);
    expect(body.parties[0]).toMatchObject({ role: 'owner', memberCount: 1 });
  });
});

describe('inviting a co-organiser', () => {
  it('lets someone join and see the party', async () => {
    const token = await inviteToken();
    const joined = await join(token);
    expect(joined.status).toBe(200);

    const res = await request(`/api/parties/${party.id}`, {
      repositories,
      cookie: await sessionCookie('user-2'),
    });

    expect(res.status).toBe(200);
    const shared = (await res.json()) as SharedPartyDTO;
    expect(shared.role).toBe('editor');
    expect(shared.document.name).toBe('Rooftop');
    expect(shared.members).toHaveLength(2);
  });

  it('does not require the joiner to be on the paid tier', async () => {
    // The party is somebody else's and already paid for. Charging both people
    // to run one party would make the feature useless — you cannot
    // co-organise alone.
    expect(repositories.users).toBeDefined();
    const token = await inviteToken();

    expect((await join(token, 'user-2')).status).toBe(200);
  });

  it('shows what is being joined before accepting', async () => {
    const token = await inviteToken();
    const res = await request(`/api/collaborate/${token}`, {
      repositories,
      cookie: await sessionCookie('user-2'),
    });

    const preview = (await res.json()) as CollaboratorPreviewDTO;
    expect(preview).toMatchObject({
      partyName: 'Rooftop',
      invitedBy: 'Marco',
      alreadyMember: false,
    });
  });

  it('reports when the joiner is already on the party', async () => {
    const token = await inviteToken();
    await join(token);

    const res = await request(`/api/collaborate/${token}`, {
      repositories,
      cookie: await sessionCookie('user-2'),
    });

    expect(((await res.json()) as CollaboratorPreviewDTO).alreadyMember).toBe(
      true,
    );
  });

  it('is idempotent — joining twice is not an error', async () => {
    const token = await inviteToken();
    expect((await join(token)).status).toBe(200);
    expect((await join(token)).status).toBe(200);

    const members = await repositories.members.listMembers(party.id);
    expect(members.ok && members.value).toHaveLength(2);
  });

  it('does not demote the owner who opens their own link', async () => {
    const token = await inviteToken();
    await join(token, 'user-1');

    const role = await repositories.members.roleFor(party.id, 'user-1');
    expect(role.ok && role.value).toBe('owner');
  });

  it('refuses an anonymous joiner — an editor has to be somebody', async () => {
    const token = await inviteToken();
    const res = await request(`/api/collaborate/${token}`, {
      repositories,
      method: 'POST',
    });

    expect(res.status).toBe(401);
  });

  it('404s an unknown token', async () => {
    expect((await join('not-a-token')).status).toBe(404);
  });

  it('404s a revoked link, indistinguishably from an unknown one', async () => {
    // Telling them apart would confirm to a stranger that they guessed a real
    // token.
    const token = await inviteToken();
    const revoked = await request(`/api/parties/${party.id}/members/invites`, {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'DELETE',
    });
    expect(revoked.status).toBe(200);

    expect((await join(token)).status).toBe(404);
  });

  it('refuses to mint a link for an editor', async () => {
    // An editor who could invite could add back someone the owner just
    // removed, which would make removal meaningless.
    await join(await inviteToken());

    const res = await request(`/api/parties/${party.id}/members/invite`, {
      repositories,
      cookie: await sessionCookie('user-2'),
      method: 'POST',
    });

    expect(res.status).toBe(403);
  });
});

describe('what an editor may do', () => {
  beforeEach(async () => {
    await join(await inviteToken());
  });

  it('edits the party', async () => {
    const res = await request(`/api/parties/${party.id}`, {
      repositories,
      cookie: await sessionCookie('user-2'),
      method: 'PATCH',
      body: { baseVersion: party.version, patch: { name: 'Rooftop II' } },
    });

    expect(res.status).toBe(200);
    const stored = await repositories.parties.findById(party.id);
    expect(stored.ok && stored.value.document?.name).toBe('Rooftop II');
  });

  it('reads the funnel', async () => {
    const res = await request(`/api/parties/${party.id}/invites`, {
      repositories,
      cookie: await sessionCookie('user-2'),
    });

    expect(res.status).toBe(200);
  });

  it('opens the guest invite link', async () => {
    // Sharing the party with guests is running the party, which is the job.
    const res = await request(`/api/parties/${party.id}/invite-link`, {
      repositories,
      cookie: await sessionCookie('user-2'),
      method: 'POST',
    });

    expect(res.status).toBe(200);
  });

  it('may not close a link the owner opened', async () => {
    // That invalidates invitations the owner has already sent — a decision,
    // not an edit.
    const res = await request(`/api/parties/${party.id}/invite-link`, {
      repositories,
      cookie: await sessionCookie('user-2'),
      method: 'DELETE',
    });

    expect(res.status).toBe(403);
  });

  it('may not delete the party', async () => {
    const res = await request(`/api/parties/${party.id}`, {
      repositories,
      cookie: await sessionCookie('user-2'),
      method: 'DELETE',
    });

    expect(res.status).toBe(403);
    expect((await repositories.parties.findById(party.id)).ok).toBe(true);
  });

  it('may not remove the owner', async () => {
    const res = await request(`/api/parties/${party.id}/members/user-1`, {
      repositories,
      cookie: await sessionCookie('user-2'),
      method: 'DELETE',
    });

    expect(res.status).toBe(403);
  });

  it('may leave of their own accord', async () => {
    const res = await request(`/api/parties/${party.id}/members/user-2`, {
      repositories,
      cookie: await sessionCookie('user-2'),
      method: 'DELETE',
    });

    expect(res.status).toBe(200);
    expect((await repositories.members.roleFor(party.id, 'user-2')).ok).toBe(
      false,
    );
  });

  it('sees the party in their own list', async () => {
    const res = await request('/api/parties', {
      repositories,
      cookie: await sessionCookie('user-2'),
    });

    const body = (await res.json()) as { parties: PartySummaryDTO[] };
    expect(body.parties).toHaveLength(1);
    expect(body.parties[0]).toMatchObject({ role: 'editor', memberCount: 2 });
  });
});

describe('removing a co-organiser', () => {
  it('takes their access away', async () => {
    await join(await inviteToken());

    const removed = await request(`/api/parties/${party.id}/members/user-2`, {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'DELETE',
    });
    expect(removed.status).toBe(200);

    const res = await request(`/api/parties/${party.id}`, {
      repositories,
      cookie: await sessionCookie('user-2'),
    });
    expect(res.status).toBe(404);
  });

  it('refuses to remove the owner, who would leave the party ownerless', async () => {
    const res = await request(`/api/parties/${party.id}/members/user-1`, {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'DELETE',
    });

    expect(res.status).toBe(409);
  });
});

describe('a party someone is not on', () => {
  it('is a 404, not a 403 — an id must not be probeable', async () => {
    for (const path of [
      `/api/parties/${party.id}`,
      `/api/parties/${party.id}/invites`,
      `/api/parties/${party.id}/members`,
    ]) {
      const res = await request(path, {
        repositories,
        cookie: await sessionCookie('user-2'),
      });
      expect(res.status, path).toBe(404);
    }
  });

  it('cannot be edited', async () => {
    const res = await request(`/api/parties/${party.id}`, {
      repositories,
      cookie: await sessionCookie('user-2'),
      method: 'PATCH',
      body: { baseVersion: 1, patch: { name: 'Hijacked' } },
    });

    expect(res.status).toBe(404);
  });
});
