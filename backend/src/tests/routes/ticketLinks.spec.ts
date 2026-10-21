import { beforeEach, describe, expect, it } from 'vitest';
import type { HostInviteDTO, InviteOpenDTO } from '../../../../shared/invites';
import { emptyPaymentDetails } from '../../../../shared/payments';
import type { TicketLinkDTO } from '../../../../shared/ticketLinks';
import { isTicketSlug } from '../../../../shared/ticketLinks';
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
 * Short ticket links (#41). Anna owns a party guests pay for, Bruno
 * co-organises it, Carla has nothing to do with it.
 */
function threeUsers() {
  return fakeUsers([
    aUser({ id: 'user-1', email: 'anna@example.com', tier: 'pro' }),
    aUser({ id: 'user-2', email: 'bruno@example.com', tier: 'free' }),
    aUser({ id: 'user-3', email: 'carla@example.com', tier: 'pro' }),
  ]);
}

let repositories: Repositories;
let partyId: string;
let slug: string;

beforeEach(async () => {
  resetFakeIds();
  repositories = repositoriesWith(threeUsers());
  const published = await publishAndOpenInvites(
    repositories,
    'user-1',
    aDocument({
      name: 'Rooftop',
      payment: { ...emptyPaymentDetails(), paypal: 'annaparty' },
    }),
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
});

/** A guest who confirmed with an email and a phone; marked paid unless told not to. */
async function aGuest(paid = true): Promise<HostInviteDTO> {
  const opened = (await (
    await request(`/invite/${slug}/open`, {
      repositories,
      method: 'POST',
      body: {},
    })
  ).json()) as InviteOpenDTO;
  await request(`/invite/${slug}/answer`, {
    repositories,
    method: 'POST',
    body: {
      inviteId: opened.inviteId,
      name: 'Giulia',
      answer: 'confirmed',
      email: 'giulia.secret@example.com',
      phone: '+393339998877',
    },
  });
  if (paid) await markPaid(opened.inviteId, 'POST');
  const list = await request(`/api/parties/${partyId}/invites`, {
    repositories,
    cookie: await sessionCookie('user-1'),
  });
  const { invites } = (await list.json()) as { invites: HostInviteDTO[] };
  return invites.find((i) => i.id === opened.inviteId)!;
}

async function markPaid(inviteId: string, method: 'POST' | 'DELETE') {
  return request(`/api/parties/${partyId}/invites/${inviteId}/paid`, {
    repositories,
    cookie: await sessionCookie('user-1'),
    method,
  });
}

/** A signed ticket as the organiser's browser makes one: `<payload>.<HMAC>`. */
function signedFor(code: string, sig = 'signature-bytes'): string {
  const payload = {
    code,
    partyId,
    guestName: 'Giulia',
    expiresAt: '2026-11-15T05:00:00.000Z',
  };
  return `${btoa(JSON.stringify(payload))}.${btoa(sig)}`;
}

async function store(
  inviteId: string,
  signed: string,
  as: string | null = 'user-1',
): Promise<Response> {
  const path = `/api/parties/${partyId}/invites/${inviteId}/ticket`;
  const init = { repositories, method: 'PUT' as const, body: { signed } };
  if (as === null) return request(path, init);
  return request(path, { ...init, cookie: await sessionCookie(as) });
}

function open(ticketSlug: string): Promise<Response> {
  return request(`/ticket/${ticketSlug}`, { repositories });
}

describe('storing a ticket for its short link', () => {
  it('gives a paid guest a long random slug that serves their ticket', async () => {
    const guest = await aGuest();
    const signed = signedFor(guest.ticketCode);

    const res = await store(guest.id, signed);
    expect(res.status).toBe(200);
    const { slug: ticketSlug } = (await res.json()) as { slug: string };
    expect(isTicketSlug(ticketSlug)).toBe(true);

    const opened = await open(ticketSlug);
    expect(opened.status).toBe(200);
    const dto = (await opened.json()) as TicketLinkDTO;
    // Byte for byte what the organiser signed: that is what the door verifies.
    expect(dto.signed).toBe(signed);
    expect(dto.party).toBe('Rooftop');
  });

  it('keeps the slug when the ticket is sent again', async () => {
    const guest = await aGuest();
    const first = (await (
      await store(guest.id, signedFor(guest.ticketCode, 'one'))
    ).json()) as { slug: string };

    const second = (await (
      await store(guest.id, signedFor(guest.ticketCode, 'two'), 'user-2')
    ).json()) as { slug: string };

    expect(second.slug).toBe(first.slug);
    const dto = (await (await open(first.slug)).json()) as TicketLinkDTO;
    expect(dto.signed).toBe(signedFor(guest.ticketCode, 'two'));
  });

  it('refuses a guest who has not paid on a paid party', async () => {
    const guest = await aGuest(false);
    const res = await store(guest.id, signedFor(guest.ticketCode));
    expect(res.status).toBe(409);
  });

  it('refuses a ticket carrying another guest’s code', async () => {
    const guest = await aGuest();
    const res = await store(guest.id, signedFor('ZZ99Z'));
    expect(res.status).toBe(400);
  });

  it('refuses something that is not a signed ticket', async () => {
    const guest = await aGuest();
    const res = await store(guest.id, 'hello');
    expect(res.status).toBe(400);
  });

  it('is only for the party’s organisers', async () => {
    const guest = await aGuest();
    const signed = signedFor(guest.ticketCode);

    expect((await store(guest.id, signed, 'user-3')).status).toBe(404);
    expect((await store(guest.id, signed, null)).status).toBe(401);
  });
});

describe('opening a short link', () => {
  async function aLiveLink(): Promise<{ guest: HostInviteDTO; link: string }> {
    const guest = await aGuest();
    const { slug: link } = (await (
      await store(guest.id, signedFor(guest.ticketCode))
    ).json()) as { slug: string };
    return { guest, link };
  }

  it('shows nothing about the guest beyond the ticket itself', async () => {
    const { link } = await aLiveLink();
    const body = await (await open(link)).text();

    expect(body).not.toContain('giulia.secret@example.com');
    expect(body).not.toContain('3339998877');
    expect(body).not.toMatch(/paid/i);
  });

  it('is never cached, since it can be revoked', async () => {
    const { link } = await aLiveLink();
    expect((await open(link)).headers.get('cache-control')).toBe('no-store');
  });

  it('stops working when the payment is un-marked', async () => {
    const { guest, link } = await aLiveLink();
    await markPaid(guest.id, 'DELETE');
    expect((await open(link)).status).toBe(404);
  });

  it('stops working when the party is deleted', async () => {
    const { link } = await aLiveLink();
    await request(`/api/parties/${partyId}`, {
      repositories,
      cookie: await sessionCookie('user-1'),
      method: 'DELETE',
    });
    expect((await open(link)).status).toBe(404);
  });

  it('answers a revoked link, an unknown one and a malformed one alike', async () => {
    const { guest, link } = await aLiveLink();
    await markPaid(guest.id, 'DELETE');

    const bodies = await Promise.all(
      [link, '0123456789ab', 'xqk8'].map(async (s) => {
        const res = await open(s);
        return `${res.status} ${await res.text()}`;
      }),
    );
    expect(new Set(bodies).size).toBe(1);
    expect(bodies[0]).toMatch(/^404 /);
  });
});
