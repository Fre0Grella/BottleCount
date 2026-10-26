import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive, toRaw } from 'vue';
import type { SharedPartyDTO } from '../../../shared/collab';
import type { HostInviteDTO } from '../../../shared/invites';
import { emptyPaymentDetails } from '../../../shared/payments';
import { emptyPhotos } from '../../../shared/coverPhotos';
import { emptyDetails } from '../../../shared/details';
import { fetchFunnel } from '../../lib/api/guests';
import { fetchParty, patchParty } from '../../lib/api/parties';
import type { ApiResult } from '../../lib/api/request';
import { documentOf } from '../../lib/collab';
import {
  FUNNEL_MS,
  PULL_MS,
  PartySession,
  type SessionHost,
  type SessionStatus,
} from './partySession';
import type { Party } from '../../lib/types';

vi.mock('../../lib/api/parties', () => ({
  fetchParty: vi.fn(),
  patchParty: vi.fn(),
}));
vi.mock('../../lib/api/guests', () => ({ fetchFunnel: vi.fn() }));

const pullMock = vi.mocked(fetchParty);
const funnelMock = vi.mocked(fetchFunnel);
const patchMock = vi.mocked(patchParty);

const FEATURES = { cloudSync: true } as SharedPartyDTO['features'];

function aParty(id: number, remoteId: string | null): Party {
  return {
    id,
    name: `Party ${id}`,
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
    publication: remoteId
      ? {
          remoteId,
          features: FEATURES,
          version: 3,
          slug: null,
          rootToken: null,
          publishedAt: '2026-09-02T00:00:00.000Z',
        }
      : null,
  };
}

function shared(
  party: Party,
  over: Partial<SharedPartyDTO> = {},
): SharedPartyDTO {
  return {
    id: party.publication!.remoteId,
    document: documentOf(party),
    version: party.publication!.version,
    role: 'owner',
    members: [],
    updatedAt: '2026-10-01T00:00:00.000Z',
    publication: null,
    ticketKey: null,
    features: FEATURES,
    ...over,
  };
}

function guestRow(id: string, name: string): HostInviteDTO {
  return {
    id,
    name,
    status: 'confirmed',
    depth: 0,
    referrer: null,
    forwardToken: null,
    ticketCode: 'ABCDE',
    source: 'link',
    checkedIn: false,
    checkedInAt: null,
    openedAt: '2026-10-01T00:00:00.000Z',
    answeredAt: null,
    email: null,
    phone: null,
    paidAt: null,
  };
}

/**
 * A store that holds `parties` and counts the saves. Like the real one, it
 * hands out reactive parties and saves a structured clone of the raw one —
 * which throws if a Vue proxy got into it.
 */
function host(...parties: Party[]) {
  const status: SessionStatus = {
    members: [],
    role: null,
    syncPending: false,
    syncError: null,
    funnelSyncing: false,
    funnelSyncedAt: null,
  };
  const saved: number[] = [];
  const h: SessionHost = {
    status,
    party: (id) => {
      const found = parties.find((p) => p.id === id);
      return found && reactive(found);
    },
    save: (party, change) => {
      change(party);
      structuredClone(toRaw(party));
      saved.push(party.id!);
    },
  };
  return { host: h, status, saved };
}

/** A promise the test resolves when it chooses. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const ok = <T>(value: T): ApiResult<T> => ({ ok: true, value });

beforeEach(() => {
  vi.useFakeTimers();
  pullMock.mockReset();
  funnelMock.mockReset();
  patchMock.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('PartySession timers', () => {
  it('pulls the party every 6s and the funnel every 20s while it is open', async () => {
    const party = aParty(1, 'r1');
    pullMock.mockResolvedValue(ok(shared(party)));
    funnelMock.mockResolvedValue(ok([]));
    const session = new PartySession(host(party).host);

    session.start(party);
    expect(pullMock).toHaveBeenCalledTimes(1);
    expect(funnelMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(PULL_MS);
    expect(pullMock).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(FUNNEL_MS - PULL_MS);
    expect(pullMock).toHaveBeenCalledTimes(4);
    expect(funnelMock).toHaveBeenCalledTimes(2);
    session.stop();
  });

  it('leaves no timer behind once stopped', async () => {
    const party = aParty(1, 'r1');
    pullMock.mockResolvedValue(ok(shared(party)));
    funnelMock.mockResolvedValue(ok([]));
    const { host: h, status } = host(party);
    const session = new PartySession(h);

    session.start(party);
    await vi.advanceTimersByTimeAsync(0);
    status.members = [{ userId: 'u' } as SessionStatus['members'][number]];
    session.stop();

    expect(vi.getTimerCount()).toBe(0);
    expect(status.members).toEqual([]);
    expect(status.role).toBeNull();
    await vi.advanceTimersByTimeAsync(FUNNEL_MS * 3);
    expect(pullMock).toHaveBeenCalledTimes(1);
    expect(funnelMock).toHaveBeenCalledTimes(1);
  });

  it('runs one set of timers however often it is started', () => {
    const a = aParty(1, 'r1');
    const b = aParty(2, 'r2');
    pullMock.mockResolvedValue(ok(shared(a)));
    funnelMock.mockResolvedValue(ok([]));
    const session = new PartySession(host(a, b).host);

    session.start(a);
    session.start(a);
    session.start(b);
    expect(vi.getTimerCount()).toBe(2);
    session.stop();
  });

  it('does nothing for a party that is not on the server', () => {
    const party = aParty(1, null);
    const session = new PartySession(host(party).host);

    session.start(party);
    expect(vi.getTimerCount()).toBe(0);
    expect(pullMock).not.toHaveBeenCalled();
    expect(funnelMock).not.toHaveBeenCalled();
  });
});

describe('PartySession pull', () => {
  it('drops an answer for a party that was closed while it was out', async () => {
    const a = aParty(1, 'r1');
    const b = aParty(2, 'r2');
    const late = deferred<ApiResult<SharedPartyDTO>>();
    pullMock.mockReturnValueOnce(late.promise);
    pullMock.mockResolvedValue(ok(shared(b)));
    funnelMock.mockResolvedValue(ok([]));
    const { host: h, status, saved } = host(a, b);
    const session = new PartySession(h);

    session.start(a);
    session.start(b);
    await vi.advanceTimersByTimeAsync(0);
    saved.length = 0;

    late.resolve(
      ok(
        shared(a, {
          version: 9,
          document: { ...documentOf(a), name: 'Renamed elsewhere' },
          members: [{ userId: 'from-a' } as SessionStatus['members'][number]],
          publication: { slug: 'a-slug', rootToken: 'a-root' },
        }),
      ),
    );
    await vi.advanceTimersByTimeAsync(0);

    expect(status.members).toEqual([]);
    expect(saved).toEqual([]);
    expect(a.name).toBe('Party 1');
    expect(b.name).toBe('Party 2');
    expect(a.publication?.slug).toBeNull();
    session.stop();
  });

  it('adopts somebody else’s edit and keeps the version it came with', async () => {
    const party = aParty(1, 'r1');
    pullMock.mockResolvedValue(
      ok(
        shared(party, {
          version: 5,
          document: { ...documentOf(party), name: 'Roof' },
        }),
      ),
    );
    funnelMock.mockResolvedValue(ok([]));
    const { host: h, saved } = host(party);
    const session = new PartySession(h);

    session.start(party);
    await vi.advanceTimersByTimeAsync(0);

    expect(party.name).toBe('Roof');
    expect(party.publication?.version).toBe(5);
    expect(saved.length).toBeGreaterThan(0);
    session.stop();
  });

  it('saves the signing key and the invite link it learns, once', async () => {
    const party = aParty(1, 'r1');
    const key = { kty: 'oct', k: 'secret' };
    pullMock.mockResolvedValue(
      ok(
        shared(party, {
          ticketKey: key,
          publication: { slug: 'roof', rootToken: 'root' },
        }),
      ),
    );
    funnelMock.mockResolvedValue(ok([]));
    const { host: h, saved } = host(party);
    const session = new PartySession(h);

    session.start(party);
    await vi.advanceTimersByTimeAsync(0);
    expect(party.publication).toMatchObject({
      ticketKey: key,
      slug: 'roof',
      rootToken: 'root',
      publishedAt: '2026-09-02T00:00:00.000Z',
    });
    expect(saved).toEqual([1]);

    // Nothing new on the next pull: nothing written.
    await vi.advanceTimersByTimeAsync(PULL_MS);
    expect(pullMock).toHaveBeenCalledTimes(2);
    expect(saved).toEqual([1]);
    session.stop();
  });

  it('clears an invite link closed on another phone, keeping the key', async () => {
    const party = aParty(1, 'r1');
    const key = { kty: 'oct', k: 'secret' };
    party.publication = {
      ...party.publication!,
      slug: 'roof',
      rootToken: 'root',
      ticketKey: key,
    };
    pullMock.mockResolvedValue(
      ok(shared(party, { ticketKey: null, publication: null })),
    );
    funnelMock.mockResolvedValue(ok([]));
    const { host: h, saved } = host(party);
    const session = new PartySession(h);

    session.start(party);
    await vi.advanceTimersByTimeAsync(0);
    expect(party.publication).toMatchObject({
      slug: null,
      rootToken: null,
      ticketKey: key,
    });
    // Saved, which a Vue proxy left inside the publication would have thrown.
    expect(saved).toEqual([1]);
    session.stop();
  });
});

describe('PartySession funnel', () => {
  it('saves new guests and writes nothing when nothing changed', async () => {
    const party = aParty(1, 'r1');
    pullMock.mockResolvedValue(ok(shared(party)));
    funnelMock.mockResolvedValue(ok([guestRow('g1', 'Anna')]));
    const { host: h, status, saved } = host(party);
    const session = new PartySession(h);

    session.start(party);
    await vi.advanceTimersByTimeAsync(0);
    expect(party.invites.map((i) => i.name)).toEqual(['Anna']);
    expect(saved).toEqual([1]);
    expect(status.funnelSyncedAt).not.toBeNull();
    expect(status.funnelSyncing).toBe(false);

    await vi.advanceTimersByTimeAsync(FUNNEL_MS);
    expect(funnelMock).toHaveBeenCalledTimes(2);
    expect(saved).toEqual([1]);
    session.stop();
  });
});

describe('PartySession push', () => {
  it('pushes an edit to its own party only', async () => {
    const a = aParty(1, 'r1');
    const b = aParty(2, 'r2');
    pullMock.mockResolvedValue(ok(shared(a)));
    funnelMock.mockResolvedValue(ok([]));
    patchMock.mockResolvedValue(
      ok({ version: 4, document: null, updatedAt: 'x' }),
    );
    const session = new PartySession(host(a, b).host);

    session.start(a);
    await vi.advanceTimersByTimeAsync(0);
    b.name = 'Not synced';
    session.record(b);
    await session.flush();
    expect(patchMock).not.toHaveBeenCalled();

    a.name = 'Synced';
    session.record(a);
    await session.flush();
    expect(patchMock).toHaveBeenCalledWith('r1', 3, { name: 'Synced' });
    expect(a.publication?.version).toBe(4);
    session.stop();
  });

  it('keeps the version of the last push, answered after the party closed', async () => {
    const party = aParty(1, 'r1');
    pullMock.mockResolvedValue(ok(shared(party)));
    funnelMock.mockResolvedValue(ok([]));
    const answer = deferred<Awaited<ReturnType<typeof patchParty>>>();
    patchMock.mockReturnValue(answer.promise);
    const { host: h, saved } = host(party);
    const session = new PartySession(h);

    session.start(party);
    await vi.advanceTimersByTimeAsync(0);
    saved.length = 0;
    party.name = 'Last edit';
    session.record(party);
    const flushed = session.flush();
    session.stop();

    answer.resolve(ok({ version: 4, document: null, updatedAt: 'x' }));
    await flushed;
    expect(party.publication?.version).toBe(4);
    expect(saved).toEqual([1]);
  });
});
