import { reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import type { HostInviteDTO } from '../../shared/invites';
import { adoptRemoteGuest, mergeFunnel } from './invites';
import type { Invite } from './types';

function remote(overrides: Partial<HostInviteDTO> = {}): HostInviteDTO {
  return {
    id: 'remote-1',
    name: 'Giulia',
    status: 'confirmed',
    depth: 0,
    referrer: null,
    forwardToken: 'fwd-1',
    ticketCode: 'AB23C',
    source: 'link',
    checkedIn: false,
    checkedInAt: null,
    openedAt: '2026-09-01T10:00:00.000Z',
    answeredAt: '2026-09-01T10:01:00.000Z',
    ...overrides,
  };
}

function local(overrides: Partial<Invite> = {}): Invite {
  return {
    id: 1,
    name: 'Typed In',
    status: 'confirmed',
    depth: 0,
    referrer: null,
    used: false,
    ...overrides,
  };
}

describe('mergeFunnel', () => {
  it('brings new guests in', () => {
    const merged = mergeFunnel([], [remote()]);

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      remoteId: 'remote-1',
      name: 'Giulia',
      status: 'confirmed',
    });
  });

  it('keeps guests the host typed in by hand', () => {
    // The whole reason local-only rows are recognised: hand-adding a guest is a
    // free-tier feature and the server has never heard of them. Dropping them
    // on a refresh would delete the host's work.
    const merged = mergeFunnel([local()], [remote()]);

    expect(merged.map((i) => i.name)).toEqual(['Typed In', 'Giulia']);
  });

  it('keeps hand-typed guests even when the server returns nothing', () => {
    const merged = mergeFunnel([local()], []);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.name).toBe('Typed In');
  });

  it('updates a known guest in place rather than duplicating them', () => {
    const existing = [
      local({ id: 4, remoteId: 'remote-1', status: 'opened', name: '' }),
    ];

    const merged = mergeFunnel(existing, [remote({ status: 'confirmed' })]);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.status).toBe('confirmed');
    expect(merged[0]?.name).toBe('Giulia');
  });

  it("keeps a known guest's client-side id across refreshes", () => {
    // Avatar colours and list keys are derived from it; a reshuffle on every
    // poll would make the list flicker.
    const existing = [local({ id: 9, remoteId: 'remote-1' })];

    const merged = mergeFunnel(existing, [remote()]);

    expect(merged[0]?.id).toBe(9);
  });

  it('gives new guests ids that do not collide with existing ones', () => {
    const existing = [local({ id: 3 }), local({ id: 7, remoteId: 'remote-9' })];

    const merged = mergeFunnel(existing, [
      remote({ id: 'remote-9' }),
      remote({ id: 'remote-new', name: 'Marco' }),
    ]);

    const ids = merged.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(merged.find((i) => i.name === 'Marco')?.id).toBeGreaterThan(7);
  });

  it('takes check-in from the server, not from this device', () => {
    // The point of the whole door-sync feature. A phone that did not scan
    // someone must still show them as arrived, and a phone that did must not
    // out-vote the server once a check-in has been undone.
    const merged = mergeFunnel(
      [local({ id: 2, remoteId: 'remote-1' })],
      [remote({ checkedIn: true, checkedInAt: '2026-10-02T23:14:00.000Z' })],
    );

    expect(merged[0]?.used).toBe(true);
    expect(merged[0]?.usedAt).toBe('2026-10-02T23:14:00.000Z');
  });

  it('clears a local check-in the server no longer has', () => {
    // An organiser undid it on the other phone — someone waved through by
    // mistake. Keeping the local `true` would let them in a second time.
    const existing = [
      local({ id: 2, remoteId: 'remote-1', used: true, usedAt: '23:14' }),
    ];

    const merged = mergeFunnel(existing, [remote({ checkedIn: false })]);

    expect(merged[0]?.used).toBe(false);
    expect(merged[0]?.usedAt).toBeUndefined();
  });

  it('carries the ticket code through, which the door reads', () => {
    const merged = mergeFunnel([], [remote({ ticketCode: 'PQ4XZ' })]);
    expect(merged[0]?.ticketCode).toBe('PQ4XZ');
  });

  it('drops a guest the server no longer lists', () => {
    // The host unpublished and republished, or the row was removed. The server
    // is authoritative for link-sourced guests — that is the difference between
    // them and hand-typed ones.
    const existing = [local({ id: 2, remoteId: 'remote-gone' })];

    const merged = mergeFunnel(existing, [remote()]);

    expect(merged.map((i) => i.remoteId)).toEqual(['remote-1']);
  });

  it('represents an unanswered guest with an empty name', () => {
    const merged = mergeFunnel(
      [],
      [remote({ status: 'opened', name: null, answeredAt: null })],
    );

    expect(merged[0]?.name).toBe('');
    expect(merged[0]?.status).toBe('opened');
    expect(merged[0]?.answeredAt).toBeUndefined();
  });

  it('carries depth and referrer through for the spread view', () => {
    const merged = mergeFunnel(
      [],
      [remote({ id: 'r2', name: 'Marco', depth: 2, referrer: 'Giulia' })],
    );

    expect(merged[0]).toMatchObject({ depth: 2, referrer: 'Giulia' });
  });

  it('does not mutate the array it was given', () => {
    const existing = [local({ id: 1, remoteId: 'remote-1', status: 'opened' })];
    const before = structuredClone(existing);

    mergeFunnel(existing, [remote({ status: 'confirmed' })]);

    expect(existing).toEqual(before);
  });
});

describe('mergeFunnel stability', () => {
  // The poll commits only when the merged list differs from the one it has.
  // If a no-op merge were not stable, the guard in `syncFunnel` would never
  // fire and the party would be written to IndexedDB every twenty seconds.
  it('produces an equivalent list when nothing has changed', () => {
    const first = mergeFunnel(
      [local({ id: 1 })],
      [remote(), remote({ id: 'r2', name: 'Marco' })],
    );
    const second = mergeFunnel(first, [
      remote(),
      remote({ id: 'r2', name: 'Marco' }),
    ]);

    expect(second).toEqual(first);
  });
});

describe('mergeFunnel and the reactive guest list', () => {
  it('returns rows that can be saved to IndexedDB', () => {
    // The store passes `party.invites`, whose rows are Vue proxies. Carrying
    // them into the result put proxies inside the raw party, and the next save
    // failed with a DataCloneError — the party silently stopped persisting.
    const existing = reactive([local({ id: 1 })]) as Invite[];

    const merged = mergeFunnel(existing, [remote()]);

    expect(() => structuredClone(merged)).not.toThrow();
  });
});

describe('adoptRemoteGuest', () => {
  const saved = remote({
    id: 'remote-9',
    name: 'Harry',
    source: 'manual',
    forwardToken: null,
    ticketCode: 'HX7K2',
    answeredAt: null,
  });

  it('gives the hand-typed row its server id, so a refresh updates it in place', () => {
    const existing = [local({ id: 4, name: 'Harry', source: 'manual' })];

    const adopted = adoptRemoteGuest(existing, 4, saved);

    expect(adopted).toHaveLength(1);
    expect(adopted[0]).toMatchObject({
      id: 4,
      name: 'Harry',
      remoteId: 'remote-9',
      ticketCode: 'HX7K2',
    });
  });

  it('leaves exactly one Harry after the next funnel refresh', () => {
    // Without the adoption the row kept no remoteId, mergeFunnel kept it as a
    // hand-typed guest *and* added the server's copy: two Harrys, for good.
    const existing = [local({ id: 4, name: 'Harry', source: 'manual' })];

    const merged = mergeFunnel(adoptRemoteGuest(existing, 4, saved), [saved]);

    expect(merged.filter((i) => i.name === 'Harry')).toHaveLength(1);
    expect(merged[0]?.id).toBe(4);
  });

  it('drops the local row when a refresh already brought the server copy in', () => {
    // A poll can land between the POST and its answer. The server's row is
    // then already in the list, and keeping both would show Harry twice.
    const existing = [
      local({ id: 4, name: 'Harry', source: 'manual' }),
      local({ id: 5, name: 'Harry', remoteId: 'remote-9', source: 'manual' }),
    ];

    const adopted = adoptRemoteGuest(existing, 4, saved);

    expect(adopted).toHaveLength(1);
    expect(adopted[0]?.remoteId).toBe('remote-9');
  });

  it('changes nothing when the row is gone', () => {
    const existing = [local({ id: 1 })];

    expect(adoptRemoteGuest(existing, 99, saved)).toEqual(existing);
  });
});
