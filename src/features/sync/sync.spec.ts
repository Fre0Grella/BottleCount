import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyPaymentDetails } from '../../../shared/payments';
import { emptyPhotos } from '../../../shared/coverPhotos';
import { emptyDetails } from '../../../shared/details';
import { fakeWorker, sent } from '../../lib/api/testing';
import { documentOf } from '../../lib/collab';
import { PartySync, type SyncCallbacks } from './sync';
import type { Party } from '../../lib/types';

function aParty(): Party {
  return {
    id: 1,
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
    invites: [],
  };
}

function callbacks(): SyncCallbacks & { errors: string[] } {
  const errors: string[] = [];
  return {
    errors,
    onRemoteDocument: vi.fn(),
    onVersion: vi.fn(),
    onError: (error) => errors.push(error),
    onPendingChanged: vi.fn(),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('PartySync push', () => {
  it('keeps an edit made offline and sends it once the network is back', async () => {
    const party = aParty();
    const cb = callbacks();
    const sync = new PartySync('p1', documentOf(party), 3, cb);
    const fake = fakeWorker('offline', { json: { version: 4 } });

    party.name = 'Roof';
    sync.record(party);
    await sync.flush();

    expect(cb.errors).toEqual(['network_error']);
    expect(sync.hasPending).toBe(true);
    expect(sync.currentVersion).toBe(3);

    await vi.runOnlyPendingTimersAsync();

    expect(fake).toHaveBeenCalledTimes(2);
    expect(sent(fake, 1).body).toEqual({
      baseVersion: 3,
      patch: { name: 'Roof' },
    });
    expect(sync.hasPending).toBe(false);
    expect(sync.currentVersion).toBe(4);
    sync.stop();
  });

  it("reports the server's reason for a refused patch", async () => {
    const party = aParty();
    const cb = callbacks();
    const sync = new PartySync('p1', documentOf(party), 3, cb);
    fakeWorker({ status: 403, json: { error: 'forbidden' } });

    party.name = 'Roof';
    sync.record(party);
    await sync.flush();

    expect(cb.errors).toEqual(['forbidden']);
    expect(sync.hasPending).toBe(true);
    sync.stop();
  });
});
