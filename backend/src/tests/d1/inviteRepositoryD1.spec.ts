import { describe, expect, it } from 'vitest';
import { isUniqueViolation } from '../../repositories/d1/constraints';
import { InviteRepositoryD1 } from '../../repositories/d1/inviteRepositoryD1';
import { INVITE_ERRORS } from '../../repositories/inviteRepository';
import { stubD1, uniqueViolation } from '../support/d1Stub';

/** An `invites` row as D1 hands it back. */
function inviteRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'invite-1',
    party_id: 'party-1',
    name: 'Giulia',
    status: 'confirmed',
    depth: 0,
    referrer_id: null,
    forward_token: 'fwd',
    ticket_code: 'ABCDE',
    source: 'manual',
    checked_in: 0,
    checked_in_at: null,
    opened_at: '2026-01-01T00:00:00.000Z',
    answered_at: '2026-01-01T00:00:00.000Z',
    email: null,
    phone: null,
    paid_at: null,
    ticket_slug: 'slug',
    ticket_signed: 'signed',
    ...overrides,
  };
}

/** A D1 whose statements throw `errors` in turn, then return a row. */
function failingThen(errors: Error[]): { db: D1Database; calls: () => number } {
  let calls = 0;
  const db = stubD1(() => {
    const error = errors[calls++];
    if (error) throw error;
    return inviteRow();
  });
  return { db, calls: () => calls };
}

const manualGuest = {
  partyId: 'party-1',
  name: 'Giulia',
  contact: { email: null, phone: null },
};

describe('isUniqueViolation', () => {
  it('recognises the column D1 names, among several', () => {
    const error = uniqueViolation('invites.party_id, invites.ticket_code');
    expect(isUniqueViolation(error, 'invites.ticket_code')).toBe(true);
    expect(isUniqueViolation(error, 'invites.ticket_slug')).toBe(false);
  });

  it('is false for anything that is not a unique violation', () => {
    expect(isUniqueViolation(new Error('D1_ERROR: network'), 'x.y')).toBe(
      false,
    );
    expect(isUniqueViolation('UNIQUE constraint failed: x.y', 'x.y')).toBe(
      false,
    );
  });
});

describe('InviteRepositoryD1 drawing a ticket code', () => {
  it('redraws when the code was taken', async () => {
    const { db, calls } = failingThen([
      uniqueViolation('invites.party_id, invites.ticket_code'),
    ]);

    const added = await new InviteRepositoryD1(db).addManual(manualGuest);

    expect(added.ok).toBe(true);
    expect(calls()).toBe(2);
  });

  // It used to swallow every error as a collision: an outage was redrawn five
  // times and then reported as "no ticket code free".
  it('lets any other failure through', async () => {
    const { db, calls } = failingThen([new Error('D1_ERROR: network lost')]);

    await expect(
      new InviteRepositoryD1(db).addManual(manualGuest),
    ).rejects.toThrow('network lost');
    expect(calls()).toBe(1);
  });

  it('does not take another unique column for the code', async () => {
    const { db } = failingThen([uniqueViolation('invites.forward_token')]);

    await expect(
      new InviteRepositoryD1(db).open({
        partyId: 'party-1',
        referrerToken: null,
        rootToken: 'root',
        existingInviteId: null,
      }),
    ).rejects.toThrow('forward_token');
  });
});

describe('InviteRepositoryD1 storing a ticket', () => {
  const ticket = { inviteId: 'invite-1', partyId: 'party-1', signed: 's' };

  it('redraws a slug another invite holds, a bounded number of times', async () => {
    const taken = uniqueViolation('invites.ticket_slug');
    const { db, calls } = failingThen([taken, taken, taken, taken]);

    const stored = await new InviteRepositoryD1(db).setTicket(ticket);

    expect(stored).toEqual({ ok: false, error: INVITE_ERRORS.SLUG_TAKEN });
    expect(calls()).toBe(3);
  });

  it('keeps the slug it got on a redraw', async () => {
    const { db } = failingThen([uniqueViolation('invites.ticket_slug')]);

    const stored = await new InviteRepositoryD1(db).setTicket(ticket);

    expect(stored.ok && stored.value.ticketSlug).toBe('slug');
  });

  it('lets any other failure through', async () => {
    const { db } = failingThen([new Error('D1_ERROR: overloaded')]);

    await expect(new InviteRepositoryD1(db).setTicket(ticket)).rejects.toThrow(
      'overloaded',
    );
  });
});
