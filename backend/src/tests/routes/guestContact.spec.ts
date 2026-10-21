import { beforeEach, describe, expect, it } from 'vitest';
import type { HostInviteDTO, InviteOpenDTO } from '../../../../shared/invites';
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

/**
 * Guest contact details (#21) and marking guests as paid (#23).
 *
 * Anna owns the party, Bruno co-organises it, and Carla is signed in but has
 * nothing to do with it.
 */
function threeUsers() {
  return fakeUsers([
    aUser({ id: 'user-1', email: 'anna@example.com', tier: 'pro' }),
    aUser({ id: 'user-2', email: 'bruno@example.com', tier: 'free' }),
    aUser({ id: 'user-3', email: 'carla@example.com', tier: 'pro' }),
  ]);
}

/** A party guests pay for: a ticket price and a PayPal to pay it to. */
const PAID = aDocument({
  payment: { ...emptyPaymentDetails(), paypal: 'annaparty' },
});
/** The same party with no way to pay: the default price alone is not paid. */
const FREE = aDocument();

let repositories: Repositories;
let partyId: string;
let slug: string;

async function setUp(document = PAID): Promise<void> {
  repositories = repositoriesWith(threeUsers());
  const published = await publishAndOpenInvites(
    repositories,
    'user-1',
    document,
  );
  partyId = published.party.id;
  slug = published.slug;

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
}

beforeEach(async () => {
  resetFakeIds();
  await setUp();
});

async function open(body: Record<string, unknown> = {}): Promise<Response> {
  return request(`/invite/${slug}/open`, {
    repositories,
    method: 'POST',
    body,
  });
}

async function answer(body: Record<string, unknown>): Promise<Response> {
  return request(`/invite/${slug}/answer`, {
    repositories,
    method: 'POST',
    body,
  });
}

/** Opens the link and answers, returning both raw responses. */
async function rsvp(
  fields: Record<string, unknown>,
): Promise<{ opened: InviteOpenDTO; res: Response }> {
  const opened = (await (await open()).json()) as InviteOpenDTO;
  const res = await answer({ inviteId: opened.inviteId, ...fields });
  return { opened, res };
}

async function guestList(as = 'user-1'): Promise<HostInviteDTO[]> {
  const res = await request(`/api/parties/${partyId}/invites`, {
    repositories,
    cookie: await sessionCookie(as),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { invites: HostInviteDTO[] }).invites;
}

describe('a guest confirming a paid party', () => {
  it('tells the form contact details will be needed, before anyone answers', async () => {
    const opened = (await (await open()).json()) as InviteOpenDTO;
    expect(opened.party.paid).toBe(true);
  });

  it('is refused with neither an email nor a phone', async () => {
    const { res } = await rsvp({ name: 'Giulia', answer: 'confirmed' });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'contact_required' });
  });

  it('takes a phone number alone', async () => {
    const { res } = await rsvp({
      name: 'Giulia',
      answer: 'confirmed',
      phone: '333 123 4567',
    });
    expect(res.status).toBe(200);

    const [giulia] = await guestList();
    expect(giulia).toMatchObject({ email: null, phone: '+393331234567' });
  });

  it('takes an email alone', async () => {
    const { res } = await rsvp({
      name: 'Giulia',
      answer: 'confirmed',
      email: 'giulia@example.com',
    });
    expect(res.status).toBe(200);

    const [giulia] = await guestList();
    expect(giulia).toMatchObject({ email: 'giulia@example.com', phone: null });
  });

  it('is refused with an email that is not one', async () => {
    const { res } = await rsvp({
      name: 'Giulia',
      answer: 'confirmed',
      email: 'giulia',
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_email' });
  });

  it('is refused with a phone number that is not one', async () => {
    const { res } = await rsvp({
      name: 'Giulia',
      answer: 'confirmed',
      email: 'giulia@example.com',
      phone: 'call me',
    });

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_phone' });
  });

  it('stores the email and phone for the organisers, normalised', async () => {
    const { res } = await rsvp({
      name: 'Giulia',
      answer: 'confirmed',
      email: ' Giulia@Example.com ',
      phone: '333 123 4567',
    });
    expect(res.status).toBe(200);

    for (const organiser of ['user-1', 'user-2']) {
      const [giulia] = await guestList(organiser);
      expect(giulia).toMatchObject({
        email: 'giulia@example.com',
        phone: '+393331234567',
      });
    }
  });

  it('can still decline without an email', async () => {
    const { res } = await rsvp({ name: 'Giulia', answer: 'declined' });
    expect(res.status).toBe(200);
  });

  it('forgets the contact details of a guest who changes to no', async () => {
    const { opened } = await rsvp({
      name: 'Giulia',
      answer: 'confirmed',
      email: 'giulia@example.com',
      phone: '+39 333 123 4567',
    });

    await answer({
      inviteId: opened.inviteId,
      name: 'Giulia',
      answer: 'declined',
    });

    const [giulia] = await guestList();
    expect(giulia).toMatchObject({ email: null, phone: null });
  });
});

describe('a guest confirming a free party', () => {
  beforeEach(async () => {
    resetFakeIds();
    await setUp(FREE);
  });

  it('needs no email, as before', async () => {
    const opened = (await (await open()).json()) as InviteOpenDTO;
    expect(opened.party.paid).toBe(false);

    const res = await answer({
      inviteId: opened.inviteId,
      name: 'Giulia',
      answer: 'confirmed',
    });
    expect(res.status).toBe(200);
  });

  it('keeps nothing it was sent anyway', async () => {
    await rsvp({
      name: 'Giulia',
      answer: 'confirmed',
      email: 'giulia@example.com',
    });

    const [giulia] = await guestList();
    expect(giulia?.email).toBeNull();
  });
});

describe('what a link holder can see', () => {
  it('never includes a guest’s email or phone, theirs or anyone else’s', async () => {
    const secretEmail = 'giulia.secret@example.com';
    const secretPhone = '+393339998877';

    const giulia = await rsvp({
      name: 'Giulia',
      answer: 'confirmed',
      email: secretEmail,
      phone: secretPhone,
    });
    const responses = [await giulia.res.text()];

    // Giulia coming back to the link, and a second guest going through it.
    const back = await open({ inviteId: giulia.opened.inviteId });
    responses.push(await back.text());
    const marco = await open();
    const marcoText = await marco.text();
    responses.push(marcoText);
    const marcoId = (JSON.parse(marcoText) as InviteOpenDTO).inviteId;
    const answered = await answer({
      inviteId: marcoId,
      name: 'Marco',
      answer: 'confirmed',
      email: 'marco@example.com',
    });
    responses.push(await answered.text());

    for (const body of responses) {
      expect(body).not.toContain(secretEmail);
      expect(body).not.toContain(secretPhone);
      expect(body).not.toContain('marco@example.com');
    }
  });
});

describe('deleting the party from the server', () => {
  it('deletes its guests’ contact details with it', async () => {
    await rsvp({
      name: 'Giulia',
      answer: 'confirmed',
      email: 'giulia@example.com',
      phone: '+393331234567',
    });

    const res = await request(`/api/parties/${partyId}`, {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'DELETE',
    });
    expect(res.status).toBe(200);

    const remaining = await repositories.invites.listForParty(partyId);
    expect(remaining.ok && remaining.value).toEqual([]);
  });
});

describe('an organiser adding or correcting a guest', () => {
  it('can give a hand-typed guest an email and phone', async () => {
    const res = await request(`/api/parties/${partyId}/invites`, {
      repositories,
      cookie: await sessionCookie('user-2'),
      method: 'POST',
      body: { name: 'Nonna', email: 'nonna@example.com', phone: '3331234567' },
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      source: 'manual',
      email: 'nonna@example.com',
      phone: '+393331234567',
    });
  });

  it('refuses an email that is not one', async () => {
    const res = await request(`/api/parties/${partyId}/invites`, {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'POST',
      body: { name: 'Nonna', email: 'nonna' },
    });

    expect(res.status).toBe(400);
  });

  it('can set and clear a guest’s contact details', async () => {
    const added = (await (
      await request(`/api/parties/${partyId}/invites`, {
        repositories,
        cookie: await sessionCookie('user-1'),
        method: 'POST',
        body: { name: 'Nonna' },
      })
    ).json()) as HostInviteDTO;
    const contact = (body: Record<string, unknown>, as: string) =>
      sessionCookie(as).then((cookie) =>
        request(`/api/parties/${partyId}/invites/${added.id}/contact`, {
          repositories,
          cookie,
          method: 'PUT',
          body,
        }),
      );

    const set = await contact({ email: 'nonna@example.com' }, 'user-2');
    expect(await set.json()).toMatchObject({
      email: 'nonna@example.com',
      phone: null,
    });

    const cleared = await contact({ email: '' }, 'user-1');
    expect(await cleared.json()).toMatchObject({ email: null });
  });

  it('is not something an outsider can do', async () => {
    const guest = await rsvp({ name: 'Giulia', answer: 'declined' });
    const res = await request(
      `/api/parties/${partyId}/invites/${guest.opened.inviteId}/contact`,
      {
        repositories,
        cookie: await sessionCookie('user-3'),
        method: 'PUT',
        body: { email: 'carla@example.com' },
      },
    );

    // 404, not 403: a party you are not on does not exist as far as you know.
    expect(res.status).toBe(404);
  });
});

describe('marking a guest as paid', () => {
  async function aConfirmedGuest(): Promise<string> {
    const { opened } = await rsvp({
      name: 'Giulia',
      answer: 'confirmed',
      email: 'giulia@example.com',
    });
    return opened.inviteId;
  }

  function paid(
    inviteId: string,
    as: string | null,
    method: 'POST' | 'DELETE' = 'POST',
  ): Promise<Response> {
    const path = `/api/parties/${partyId}/invites/${inviteId}/paid`;
    if (as === null) return request(path, { repositories, method });
    return sessionCookie(as).then((cookie) =>
      request(path, { repositories, cookie, method }),
    );
  }

  it('is recorded on the server, and every organiser sees it', async () => {
    const inviteId = await aConfirmedGuest();

    const res = await paid(inviteId, 'user-1');
    expect(res.status).toBe(200);
    expect(((await res.json()) as HostInviteDTO).paidAt).not.toBeNull();

    const [onBrunosPhone] = await guestList('user-2');
    expect(onBrunosPhone?.paidAt).not.toBeNull();
  });

  it('can be undone, by a co-organiser too', async () => {
    const inviteId = await aConfirmedGuest();
    await paid(inviteId, 'user-1');

    const res = await paid(inviteId, 'user-2', 'DELETE');

    expect(res.status).toBe(200);
    const [giulia] = await guestList();
    expect(giulia?.paidAt).toBeNull();
  });

  it('keeps the time it was first marked', async () => {
    const inviteId = await aConfirmedGuest();
    const first = (await (
      await paid(inviteId, 'user-1')
    ).json()) as HostInviteDTO;

    const again = (await (
      await paid(inviteId, 'user-2')
    ).json()) as HostInviteDTO;

    expect(again.paidAt).toBe(first.paidAt);
  });

  it('is only for the party’s organisers', async () => {
    const inviteId = await aConfirmedGuest();

    expect((await paid(inviteId, 'user-3')).status).toBe(404);
    expect((await paid(inviteId, null)).status).toBe(401);
    const [giulia] = await guestList();
    expect(giulia?.paidAt).toBeNull();
  });

  it('is never shown to a link holder', async () => {
    const inviteId = await aConfirmedGuest();
    await paid(inviteId, 'user-1');

    const back = await open({ inviteId });

    expect(await back.text()).not.toMatch(/paid_?at/i);
  });
});
