import { beforeEach, describe, expect, it } from 'vitest';
import type {
  PatchPartyResponse,
  SharedPartyDTO,
} from '../../../../shared/collab';
import type { InviteOpenDTO } from '../../../../shared/invites';
import type { PublishedParty } from '../../repositories/partyRepository';
import type { Repositories } from '../../repositories/repositories';
import { fakeParties, resetFakeIds } from '../support/fakeInvites';
import { request, sessionCookie } from '../support/harness';
import { publishAndOpenInvites, repositoriesWith } from '../support/party';

/**
 * A merge patch reaches the stored document without the publish checks, and
 * RFC 7386 lets it delete any key. A party whose `settings` or `venue` was
 * patched away used to throw on every read — nobody could open it, and the
 * owner could not even delete it.
 */

let repositories: Repositories;
let party: SharedPartyDTO;
let slug: string;

beforeEach(async () => {
  resetFakeIds();
  repositories = repositoriesWith();
  ({ party, slug } = await publishAndOpenInvites(repositories));
});

async function patch(body: unknown): Promise<Response> {
  return request(`/api/parties/${party.id}`, {
    repositories,
    cookie: await sessionCookie('user-1'),
    method: 'PATCH',
    body: { baseVersion: 0, patch: body },
  });
}

async function stillWorks(): Promise<void> {
  const cookie = await sessionCookie('user-1');

  const opened = await request(`/api/parties/${party.id}`, {
    repositories,
    cookie,
  });
  expect(opened.status).toBe(200);
  const shared = (await opened.json()) as SharedPartyDTO;
  expect(shared.document.settings.ticket_price).toEqual(expect.any(Number));
  expect(shared.document.venue).toEqual(
    expect.objectContaining({ place: expect.any(String) }),
  );

  const guest = await request(`/invite/${slug}/open`, {
    repositories,
    method: 'POST',
    body: {},
  });
  expect(guest.status).toBe(200);
  expect(((await guest.json()) as InviteOpenDTO).party.venue).toBeTruthy();

  const listed = await request('/api/parties', { repositories, cookie });
  expect(listed.status).toBe(200);

  const removed = await request(`/api/parties/${party.id}`, {
    repositories,
    cookie,
    method: 'DELETE',
  });
  expect(removed.status).toBe(200);
}

describe('a patch that deletes a field the server relies on', () => {
  for (const field of ['settings', 'venue', 'payment', 'name', 'menu']) {
    it(`leaves the party usable after {"${field}": null}`, async () => {
      const res = await patch({ [field]: null });
      expect(res.status).toBe(200);
      await stillWorks();
    });
  }

  it('hands back a whole document when the client was behind', async () => {
    const res = await patch({ settings: null });
    const body = (await res.json()) as PatchPartyResponse;
    expect(body.document?.settings).toMatchObject({
      ticket_price: 0,
      buffer: 1,
      max_capacity: null,
    });
  });

  it('keeps the name the party had when the patch deletes it', async () => {
    await patch({ name: null });
    const stored = await repositories.parties.findById(party.id);
    expect(stored.ok && stored.value.name).toBe('Rooftop');
    expect(stored.ok && stored.value.document?.name).toBe('Rooftop');
  });

  it('drops a field the document does not own', async () => {
    await patch({ owner: 'someone-else' });
    const stored = await repositories.parties.findById(party.id);
    expect(stored.ok && stored.value.document).not.toHaveProperty('owner');
  });
});

describe('a party already stored broken', () => {
  // Rows written before the fix: the fake keeps whatever it is given, as D1
  // keeps whatever JSON is in the column.
  it('opens again', async () => {
    const parties = repositories.parties as ReturnType<typeof fakeParties>;
    const row = parties.rows.get(party.id) as PublishedParty;
    parties.rows.set(party.id, {
      ...row,
      document: { ...row.document, settings: null, venue: null } as never,
    });

    await stillWorks();
  });
});
