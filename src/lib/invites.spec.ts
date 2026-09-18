import { describe, expect, it } from 'vitest';
import type { HostInviteDTO } from '../../shared/invites';
import { mergeFunnel } from './invites';
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
