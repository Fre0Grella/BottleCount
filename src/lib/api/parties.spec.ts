import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyPaymentDetails } from '../../../shared/payments';
import { emptyPhotos } from '../../../shared/coverPhotos';
import { emptyDetails } from '../../../shared/details';
import type { Party } from '../types';
import {
  acceptCollaboratorInvite,
  closeInviteLink,
  deleteRemoteParty,
  listParties,
  patchParty,
  previewCollaboratorInvite,
  removeMember,
  storeParty,
  uploadCoverPhoto,
} from './parties';
import { isNotFound } from './request';
import { fakeWorker, sent } from './testing';

afterEach(() => {
  vi.unstubAllGlobals();
});

function aParty(): Party {
  return {
    id: 7,
    name: 'Rooftop',
    date: '2026-10-01',
    createdAt: '2026-09-01T00:00:00.000Z',
    cover: 0,
    photos: emptyPhotos(),
    venue: { place: 'Roof', city: 'Milan', time: '21:00' },
    settings: {
      guests: 40,
      ticket_price: 15,
      venue_cost: 0,
      equipment_cost: 0,
      alcohol_ml_per_person: 50,
      buffer: 1.1,
      max_capacity: null,
    },
    menu: {},
    catalog: { ingredients: {}, cocktails: {} },
    locks: {},
    checked: {},
    allowForward: true,
    includeSnacks: true,
    barManaged: true,
    payment: emptyPaymentDetails(),
    details: emptyDetails(),
    invites: [
      {
        id: 1,
        name: 'Ada',
        status: 'confirmed',
        depth: 0,
        referrer: null,
        source: 'manual',
        used: false,
      },
    ],
  };
}

describe('api/parties', () => {
  it('stores the document half of a party, not its guest list', async () => {
    const fake = fakeWorker({ json: { id: 'p1' } });
    expect(await storeParty(aParty())).toEqual({
      ok: true,
      value: { id: 'p1' },
    });
    const { method, path, body } = sent(fake);
    expect([method, path]).toEqual(['POST', '/api/parties']);
    const posted = body as {
      localId: number;
      document: Record<string, unknown>;
    };
    expect(posted.localId).toBe(7);
    expect(posted.document.name).toBe('Rooftop');
    expect(posted.document).not.toHaveProperty('invites');
  });

  it('patches against a base version', async () => {
    const fake = fakeWorker({ json: { version: 4 } });
    await patchParty('p/1', 3, { name: 'Roof' });
    expect(sent(fake)).toEqual({
      method: 'PATCH',
      path: '/api/parties/p%2F1',
      body: { baseVersion: 3, patch: { name: 'Roof' } },
    });
  });

  it('reads an empty DELETE answer as success', async () => {
    const fake = fakeWorker({ status: 204, text: null });
    expect(await deleteRemoteParty('p1')).toEqual({
      ok: true,
      value: undefined,
    });
    expect(sent(fake)).toMatchObject({
      method: 'DELETE',
      path: '/api/parties/p1',
    });
  });

  // Raw bytes under the photo's own type: the Worker reads the header, and a
  // JSON-encoded blob would be neither.
  it('sends a cover photo as it is, not as JSON', async () => {
    const fake = fakeWorker({ json: { token: 't' } });
    const photo = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });

    expect(await uploadCoverPhoto('p1', 'banner', photo)).toEqual({
      ok: true,
      value: { token: 't' },
    });
    const [path, init] = fake.mock.calls[0] as [string, RequestInit];
    expect([init.method, path]).toEqual([
      'PUT',
      '/api/parties/p1/photos/banner',
    ]);
    expect(init.body).toBe(photo);
    expect((init.headers as Record<string, string>)['content-type']).toBe(
      'image/webp',
    );
  });

  it('names the co-organiser routes', async () => {
    const fake = fakeWorker({ status: 204, text: null });
    await closeInviteLink('p1');
    await removeMember('p1', 'u 2');
    await acceptCollaboratorInvite('tok');
    expect([0, 1, 2].map((n) => sent(fake, n))).toMatchObject([
      { method: 'DELETE', path: '/api/parties/p1/invite-link' },
      { method: 'DELETE', path: '/api/parties/p1/members/u%202' },
      { method: 'POST', path: '/api/collaborate/tok' },
    ]);
  });

  it('reports an unknown co-organiser link as not found', async () => {
    // The server names the reason (`collaborator_invite_unknown`); the join
    // page used to look for `http_404` instead and never said "gone".
    fakeWorker({ status: 404, json: { error: 'collaborator_invite_unknown' } });
    const result = await previewCollaboratorInvite('tok');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(isNotFound(result.error)).toBe(true);
  });

  it('leaves the cached list alone when offline', async () => {
    fakeWorker('offline');
    expect(await listParties()).toEqual({
      ok: false,
      error: { kind: 'network' },
    });
  });
});
