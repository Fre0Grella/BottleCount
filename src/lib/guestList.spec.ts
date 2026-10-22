import { describe, expect, it } from 'vitest';
import { isTicketCode } from '../../shared/tickets';
import {
  manualInvite,
  setCheckedIn,
  setContact,
  setPaidAt,
  setStatus,
} from './guestList';
import type { Invite, Party } from './types';

function guest(over: Partial<Invite> = {}): Invite {
  return {
    id: 1,
    name: 'Anna',
    status: 'confirmed',
    depth: 0,
    referrer: null,
    used: false,
    ...over,
  };
}

describe('manualInvite', () => {
  it('is a confirmed, hand-typed guest with the next id and a code of their own', () => {
    const party = {
      id: 3,
      invites: [guest({ id: 4, ticketCode: 'ABCDE' }), guest({ id: 9 })],
    } as Party;
    const invite = manualInvite(party, 'Bea', {
      email: 'bea@example.com',
      phone: null,
    });

    expect(invite).toMatchObject({
      id: 10,
      name: 'Bea',
      status: 'confirmed',
      source: 'manual',
      used: false,
      email: 'bea@example.com',
    });
    expect(invite.remoteId).toBeUndefined();
    expect('phone' in invite).toBe(false);
    expect(isTicketCode(invite.ticketCode!)).toBe(true);
    expect(invite.ticketCode).not.toBe('ABCDE');
  });

  it('starts at 1 on an empty list', () => {
    const party = { id: 3, invites: [] as Invite[] } as Party;
    expect(manualInvite(party, 'Bea', { email: null, phone: null }).id).toBe(1);
  });
});

describe('setStatus', () => {
  it('takes back the check-in of someone who is no longer coming', () => {
    const invite = guest({ used: true, usedAt: '22:10' });
    setStatus(invite, 'declined');
    expect(invite).toMatchObject({ status: 'declined', used: false });
    expect(invite.usedAt).toBeUndefined();
  });

  it('leaves a confirmed guest checked in', () => {
    const invite = guest({ status: 'opened', used: true, usedAt: '22:10' });
    setStatus(invite, 'confirmed');
    expect(invite).toMatchObject({ used: true, usedAt: '22:10' });
  });
});

describe('setContact and setPaidAt', () => {
  it('stores what is given and drops what is cleared', () => {
    const invite = guest({ email: 'old@example.com', phone: '+391' });
    setContact(invite, null, '+392');
    expect('email' in invite).toBe(false);
    expect(invite.phone).toBe('+392');

    setPaidAt(invite, '2026-10-01T20:00:00.000Z');
    expect(invite.paidAt).toBe('2026-10-01T20:00:00.000Z');
    setPaidAt(invite, null);
    expect('paidAt' in invite).toBe(false);
  });
});

describe('setCheckedIn', () => {
  it('records the time a guest walked in, and takes it back', () => {
    const invite = guest();
    setCheckedIn(invite, '22:10');
    expect(invite).toMatchObject({ used: true, usedAt: '22:10' });
    setCheckedIn(invite, null);
    expect(invite.used).toBe(false);
    expect(invite.usedAt).toBeUndefined();
  });
});
