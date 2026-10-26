import { beforeEach, describe, expect, it } from 'vitest';
import type {
  InviteOpenDTO,
  PublishedPartyDTO,
} from '../../../../shared/invites';
import type { SharedPartyDTO, Venue } from '../../../../shared/collab';
import type { PartyDetails } from '../../../../shared/details';
import { emptyDetails } from '../../../../shared/details';
import type { PaymentDetails } from '../../../../shared/payments';
import { emptyPaymentDetails } from '../../../../shared/payments';
import type { Repositories } from '../../repositories/repositories';
import { resetFakeIds } from '../support/fakeInvites';
import { aUser, fakeUsers } from '../support/fakeRepositories';
import {
  aDocument,
  publishAndOpenInvites,
  repositoriesWith,
} from '../support/party';
import { request, sessionCookie } from '../support/harness';

/** A pro host with one published party whose invite link is open. */
async function aPublishedParty(
  overrides: {
    maxCapacity?: number | null;
    allowForward?: boolean;
    payment?: Partial<PaymentDetails>;
    venue?: Venue;
    details?: PartyDetails;
  } = {},
): Promise<{ repositories: Repositories; party: PublishedPartyDTO }> {
  const repositories = repositoriesWith();
  const document = aDocument({
    allowForward: overrides.allowForward ?? true,
    payment: { ...emptyPaymentDetails(), ...overrides.payment },
    venue: overrides.venue ?? aDocument().venue,
    details: overrides.details ?? aDocument().details,
    settings: {
      ...aDocument().settings,
      max_capacity: overrides.maxCapacity ?? null,
    },
  });
  const { party, slug, rootToken } = await publishAndOpenInvites(
    repositories,
    'user-1',
    document,
  );
  return {
    repositories,
    party: {
      id: party.id,
      slug,
      rootToken,
      publishedAt: party.updatedAt,
      allowForward: document.allowForward,
    },
  };
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
    const repositories = repositoriesWith(fakeUsers([aUser({ tier: 'free' })]));

    const res = await request('/api/parties', {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: { localId: 1, document: aDocument() },
    });

    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ feature: 'cloudSync' });
  });

  it('allows a free host on a self-hosted deployment', async () => {
    const repositories = repositoriesWith(fakeUsers([aUser({ tier: 'free' })]));

    const res = await request('/api/parties', {
      repositories,
      env: { SELF_HOSTED: 'true' },
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: { localId: 1, document: aDocument() },
    });

    expect(res.status).toBe(200);
  });

  it('refuses an anonymous caller', async () => {
    const res = await request('/api/parties', {
      repositories: repositoriesWith(fakeUsers()),
      method: 'POST',
      body: { localId: 1, document: aDocument() },
    });

    expect(res.status).toBe(401);
  });

  it('keeps the slug when the host republishes', async () => {
    // Every share-sheet open republishes. A new slug would break every link
    // already sent.
    const { repositories, party } = await aPublishedParty();

    const res = await request('/api/parties', {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: {
        localId: 7,
        document: aDocument({
          name: 'Rooftop (moved)',
          date: '2026-10-09',
          venue: { place: 'The Roof', city: 'Milan', time: '22:00' },
        }),
      },
    });
    expect(res.status).toBe(200);

    const republished = (await res.json()) as SharedPartyDTO;
    expect(republished.publication?.slug).toBe(party.slug);
    expect(republished.publication?.rootToken).toBe(party.rootToken);

    // …and the guest-facing card reflects the edit.
    const opened = await open(repositories, party.slug);
    expect(opened.party.name).toBe('Rooftop (moved)');
    expect(opened.party.venue.time).toBe('22:00');
  });

  it('rejects a document with no name', async () => {
    const { repositories } = await aPublishedParty();
    const res = await request('/api/parties', {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: { localId: 8, document: aDocument({ name: '   ' }) },
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

  it('shows the venue with its map pin, for "Open in Maps"', async () => {
    const venue = {
      place: 'Terrazza',
      city: 'Milano',
      time: '21:00',
      pin: { lat: 45.46, lng: 9.19, address: 'Piazza Diaz 7, Milano' },
    };
    const { repositories, party } = await aPublishedParty({ venue });

    expect((await open(repositories, party.slug)).party.venue).toEqual(venue);
  });

  // Public by design (ADR 0002): the Plan tab says so next to the fields.
  it('shows the description and practical info the host wrote', async () => {
    const details = {
      description: 'Sunset on the roof.',
      info: { ...emptyDetails().info, dress_code: 'All white' },
    };
    const { repositories, party } = await aPublishedParty({ details });

    expect((await open(repositories, party.slug)).party.details).toEqual(
      details,
    );
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
    const second = await publishAndOpenInvites(
      repositories,
      'user-1',
      aDocument({ name: 'Other', date: '2026-11-01' }),
      9,
    );

    const opened = await open(repositories, second.slug, {
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

  it('404s once the host closes the link', async () => {
    const { repositories, party } = await aPublishedParty();

    const removed = await request(`/api/parties/${party.id}/invite-link`, {
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

describe('paying the host', () => {
  const IBAN = 'IT60X0542811101000000123456';

  async function confirm(
    repositories: Repositories,
    slug: string,
  ): Promise<InviteOpenDTO> {
    const opened = await open(repositories, slug);
    const res = await answer(repositories, slug, {
      inviteId: opened.inviteId,
      name: 'Giulia',
      answer: 'confirmed',
      // A party with a way to pay needs one to send the ticket to (#21).
      email: 'giulia@example.com',
    });
    expect(res.status).toBe(200);
    return (await res.json()) as InviteOpenDTO;
  }

  it('shows a confirmed guest every way to pay, with the price', async () => {
    const { repositories, party } = await aPublishedParty({
      payment: {
        paypal: 'marcog',
        satispay: 'https://web.satispay.com/app/match/abc',
        revolut: 'https://revolut.me/marcog',
        bank_holder: 'Marco Galeri',
        bank_iban: IBAN,
      },
    });

    const dto = await confirm(repositories, party.slug);

    expect(dto.payment).toEqual({
      price: 15,
      paypalUrl: 'https://paypal.me/marcog/15EUR',
      satispayUrl: 'https://web.satispay.com/app/match/abc',
      revolutUrl: 'https://revolut.me/marcog',
      bank: { holder: 'Marco Galeri', iban: IBAN },
    });
  });

  it('withholds payment until the guest confirms', async () => {
    // Someone who has only opened the link might still find the party full.
    const { repositories, party } = await aPublishedParty({
      payment: { paypal: 'marcog' },
    });

    expect((await open(repositories, party.slug)).payment).toBeNull();
  });

  it('withholds payment from a guest who declined', async () => {
    const { repositories, party } = await aPublishedParty({
      payment: { paypal: 'marcog' },
    });
    const opened = await open(repositories, party.slug);

    const res = await answer(repositories, party.slug, {
      inviteId: opened.inviteId,
      name: 'Giulia',
      answer: 'declined',
    });

    expect(((await res.json()) as InviteOpenDTO).payment).toBeNull();
  });

  it('keeps showing it when a confirmed guest comes back', async () => {
    const { repositories, party } = await aPublishedParty({
      payment: { paypal: 'marcog' },
    });
    const confirmed = await confirm(repositories, party.slug);

    const back = await open(repositories, party.slug, {
      inviteId: confirmed.inviteId,
    });

    expect(back.payment?.paypalUrl).toBe('https://paypal.me/marcog/15EUR');
  });

  it('asks for nothing when the host set a price but no way to pay', async () => {
    // Every party has a ticket price for the budget maths; that alone must not
    // turn into a request for money.
    const { repositories, party } = await aPublishedParty();

    expect((await confirm(repositories, party.slug)).payment).toBeNull();
  });

  it('drops identifiers that do not validate when the party is published', async () => {
    const { repositories, party } = await aPublishedParty({
      payment: {
        paypal: 'javascript:alert(1)',
        satispay: 'https://satispay.com.evil.example/x',
        revolut: 'http://revolut.me/marcog',
        bank_holder: 'Marco Galeri',
        bank_iban: 'IT60X0542811101000000123465',
      },
    });

    const stored = await repositories.parties.findById(party.id);
    expect(stored.ok && stored.value.document?.payment).toEqual({
      paypal: '',
      satispay: '',
      revolut: '',
      bank_holder: 'Marco Galeri',
      bank_iban: '',
    });
    expect((await confirm(repositories, party.slug)).payment).toBeNull();
  });

  it('never shows a guest a link an organiser patched in unchecked', async () => {
    // Patches skip the publish checks, so the invite has to validate on read.
    const { repositories, party } = await aPublishedParty({
      payment: { paypal: 'marcog' },
    });
    const stored = await repositories.parties.findById(party.id);
    const version = stored.ok ? stored.value.version : 0;

    const patched = await request(`/api/parties/${party.id}`, {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'PATCH',
      body: {
        baseVersion: version,
        patch: {
          payment: {
            satispay: 'javascript:alert(1)',
            revolut: 'javascript:alert(1)',
          },
        },
      },
    });
    expect(patched.status).toBe(200);

    const dto = await confirm(repositories, party.slug);
    expect(dto.payment?.satispayUrl).toBeNull();
    expect(dto.payment?.revolutUrl).toBeNull();
    expect(dto.payment?.paypalUrl).toBe('https://paypal.me/marcog/15EUR');
  });
});
