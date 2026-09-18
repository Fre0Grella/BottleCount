import { expect } from 'vitest';
import type { PartyDocument, SharedPartyDTO } from '../../../../shared/collab';
import type { Repositories } from '../../repositories/repositories';
import { fakeInvites, fakeParties } from './fakeInvites';
import { aUser, fakeLicences, fakeUsers } from './fakeRepositories';
import { fakeMembers } from './fakeMembers';
import { request, sessionCookie } from './harness';

/** A document with everything filled in, so tests only state what they vary. */
export function aDocument(
  overrides: Partial<PartyDocument> = {},
): PartyDocument {
  return {
    name: 'Rooftop',
    date: '2026-10-02',
    cover: 1,
    venue: { place: 'The Roof', city: 'Milan', time: '21:00' },
    settings: {
      guests: 40,
      ticket_price: 15,
      venue_cost: 0,
      equipment_cost: 0,
      alcohol_ml_per_person: 50,
      buffer: 1.1,
      max_capacity: null,
    },
    menu: { Vodka: { macro_pct: 1, spirits: {} } },
    locks: {},
    checked: {},
    allowForward: true,
    includeSnacks: true,
    ...overrides,
  };
}

/**
 * Repositories wired the way the app wires them — one membership map shared
 * between parties and members, so what a test can list is what a guard allows.
 */
export function repositoriesWith(
  users = fakeUsers([aUser({ tier: 'pro' })]),
): Repositories {
  const parties = fakeParties();
  return {
    users,
    licences: fakeLicences(),
    parties,
    invites: fakeInvites(),
    members: fakeMembers(parties.memberships, () => users.rows),
  };
}

/** Publishes a party as `userId` and returns what the server said. */
export async function publishParty(
  repositories: Repositories,
  userId = 'user-1',
  document = aDocument(),
  localId = 7,
): Promise<SharedPartyDTO> {
  const res = await request('/api/parties', {
    repositories,
    cookie: await sessionCookie(userId),
    method: 'POST',
    body: { localId, document },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as SharedPartyDTO;
}

/** Publishes and opens the guest-facing link, which storing alone does not. */
export async function publishAndOpenInvites(
  repositories: Repositories,
  userId = 'user-1',
  document = aDocument(),
  localId = 7,
): Promise<{ party: SharedPartyDTO; slug: string; rootToken: string }> {
  const party = await publishParty(repositories, userId, document, localId);
  const res = await request(`/api/parties/${party.id}/invite-link`, {
    repositories,
    cookie: await sessionCookie(userId),
    method: 'POST',
  });
  expect(res.status).toBe(200);
  const link = (await res.json()) as { slug: string; rootToken: string };
  return { party, slug: link.slug, rootToken: link.rootToken };
}
