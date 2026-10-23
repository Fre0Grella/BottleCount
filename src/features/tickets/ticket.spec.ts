import { describe, expect, it } from 'vitest';
import { emptyPaymentDetails } from '../../../shared/payments';
import type { TicketQRPayload } from '../../../shared/tickets';
import { isTicketCode } from '../../../shared/tickets';
import {
  checkTicket,
  newLocalTicketCode,
  ticketCode,
  ticketExpiry,
  ticketExpiryLabel,
  ticketPayload,
  withStoredTicketCodes,
} from './ticket';
import type { Invite, Party } from '../../lib/types';

function guest(over: Partial<Invite> & Pick<Invite, 'id' | 'name'>): Invite {
  return {
    status: 'confirmed',
    depth: 0,
    referrer: null,
    used: false,
    ...over,
  };
}

function party(over: Partial<Party> = {}): Party {
  return {
    id: 3,
    name: 'Rooftop',
    date: '2026-11-14',
    settings: { ticket_price: 0 },
    payment: emptyPaymentDetails(),
    invites: [],
    publication: null,
    ...over,
  } as unknown as Party;
}

const paidParty = (over: Partial<Party> = {}) =>
  party({
    settings: { ticket_price: 15 } as Party['settings'],
    payment: { ...emptyPaymentDetails(), paypal: 'marcog' },
    ...over,
  });

describe('ticket codes', () => {
  it('still gives a guest saved before codes were stored the code on their ticket', () => {
    // Made by the code that printed those tickets, for party id 3 and 12.
    const p = party({
      invites: [
        guest({ id: 1, name: 'Anna' }),
        guest({ id: 2, name: 'Marco Rossi' }),
        guest({ id: 3, name: 'Zoë' }),
      ],
    });
    expect(ticketCode(p, 1)).toBe('K9NFJ');
    expect(ticketCode(p, 2)).toBe('H3HET');
    expect(ticketCode(p, 3)).toBe('ZQRMT');
    expect(ticketCode({ ...p, id: 12 }, 1)).toBe('SB3J3');
  });

  it('prefers the stored code', () => {
    const p = party({
      invites: [guest({ id: 1, name: 'Anna', ticketCode: 'XY23Z' })],
    });
    expect(ticketCode(p, 1)).toBe('XY23Z');
  });

  it('is empty for a guest who is not on the list', () => {
    expect(ticketCode(party(), 99)).toBe('');
  });

  it('draws a fresh code unlike the ones the party already has', () => {
    const p = party({
      invites: [guest({ id: 1, name: 'Anna', ticketCode: 'XY23Z' })],
    });
    for (let i = 0; i < 50; i++) {
      const code = newLocalTicketCode(p);
      expect(isTicketCode(code)).toBe(true);
      expect(code).not.toBe('XY23Z');
    }
  });
});

describe('withStoredTicketCodes', () => {
  it('stores the code a local guest’s ticket already carries', () => {
    const p = party({
      invites: [
        guest({ id: 1, name: 'Anna' }),
        guest({ id: 2, name: 'Bea', ticketCode: 'XY23Z' }),
      ],
    });
    const invites = withStoredTicketCodes(p);
    expect(invites?.map((i) => i.ticketCode)).toEqual(['K9NFJ', 'XY23Z']);
  });

  it('keeps that code when the guest is renamed afterwards', () => {
    const p = party({ invites: [guest({ id: 1, name: 'Anna' })] });
    const stored = { ...p, invites: withStoredTicketCodes(p)! };
    const renamed = {
      ...stored,
      invites: stored.invites.map((i) => ({ ...i, name: 'Anna Verdi' })),
    };
    expect(ticketCode(renamed, 1)).toBe('K9NFJ');
  });

  it('leaves server guests to the server', () => {
    const p = party({
      invites: [guest({ id: 1, name: 'Anna', remoteId: 'r-1' })],
    });
    expect(withStoredTicketCodes(p)).toBeNull();
  });

  it('changes nothing when every guest has a code', () => {
    const p = party({
      invites: [guest({ id: 1, name: 'Anna', ticketCode: 'XY23Z' })],
    });
    expect(withStoredTicketCodes(p)).toBeNull();
  });
});

describe('expiry', () => {
  it('is 06:00 the morning after the party', () => {
    const exp = ticketExpiry({ date: '2026-11-14' });
    expect(exp.getTime()).toBe(new Date(2026, 10, 15, 6, 0).getTime());
    expect(ticketExpiryLabel({ date: '2026-11-14' })).toBe('15 Nov 06:00');
  });

  it('is what the payload carries', () => {
    const p = party({ invites: [guest({ id: 1, name: 'Anna' })] });
    expect(ticketPayload(p, 1)?.expiresAt).toBe(ticketExpiry(p).toISOString());
  });
});

describe('ticketPayload', () => {
  it('names the guest by invite, so two guests of one name differ', () => {
    const p = party({
      invites: [
        guest({ id: 1, name: 'Anna', ticketCode: 'AAAA2' }),
        guest({ id: 2, name: 'Anna', ticketCode: 'BBBB3' }),
      ],
    });
    expect(ticketPayload(p, 1)).toMatchObject({
      code: 'AAAA2',
      guestName: 'Anna',
      partyId: '3',
    });
    expect(ticketPayload(p, 2)?.code).toBe('BBBB3');
  });

  it('is stamped with the server’s party id on a shared party', () => {
    const p = party({
      invites: [guest({ id: 1, name: 'Anna' })],
      publication: { remoteId: 'party-1' } as Party['publication'],
    });
    expect(ticketPayload(p, 1)?.partyId).toBe('party-1');
  });

  it('is null for a guest who is not on the list', () => {
    expect(ticketPayload(party(), 1)).toBeNull();
  });
});

describe('checkTicket', () => {
  const NOW = new Date('2026-11-14T22:00:00Z').getTime();

  const scan = (payload: Partial<TicketQRPayload>) => ({
    kind: 'scan' as const,
    check: {
      ok: true as const,
      payload: {
        code: 'AB23C',
        partyId: '3',
        guestName: 'Anna',
        expiresAt: '2026-11-15T05:00:00.000Z',
        ...payload,
      },
    },
  });
  const typed = (code: string, name: string) => ({
    kind: 'typed' as const,
    code,
    name,
  });

  const anna = guest({ id: 1, name: 'Anna', ticketCode: 'AB23C' });

  describe('a scanned ticket', () => {
    it('lets a confirmed guest in', () => {
      expect(checkTicket(party({ invites: [anna] }), scan({}), NOW)).toEqual({
        ok: true,
        invite: anna,
      });
    });

    it('passes on what the signature check said', () => {
      const p = party({ invites: [anna] });
      for (const reason of ['malformed', 'bad_signature'] as const) {
        expect(
          checkTicket(p, { kind: 'scan', check: { ok: false, reason } }, NOW),
        ).toEqual({ ok: false, reason });
      }
    });

    it('refuses a ticket for another party, or one that has expired', () => {
      const p = party({ invites: [anna] });
      expect(checkTicket(p, scan({ partyId: '4' }), NOW)).toMatchObject({
        reason: 'wrong_party',
        guestName: 'Anna',
      });
      expect(
        checkTicket(p, scan({ expiresAt: '2026-11-14T21:00:00Z' }), NOW),
      ).toMatchObject({ reason: 'expired' });
    });

    it('refuses a ticket that names no one on the list', () => {
      expect(
        checkTicket(party(), scan({ guestName: 'Zed' }), NOW),
      ).toMatchObject({ ok: false, reason: 'unknown_code', guestName: 'Zed' });
    });

    it('finds a guest whose stand-in code the server replaced, by name', () => {
      const p = party({ invites: [{ ...anna, ticketCode: 'ZZZZ9' }] });
      expect(checkTicket(p, scan({}), NOW).ok).toBe(true);
    });

    it('turns away someone not coming, unpaid or already inside', () => {
      expect(
        checkTicket(
          party({ invites: [{ ...anna, status: 'declined' }] }),
          scan({}),
          NOW,
        ),
      ).toMatchObject({ reason: 'not_coming' });
      expect(
        checkTicket(paidParty({ invites: [anna] }), scan({}), NOW),
      ).toMatchObject({ reason: 'unpaid' });
      expect(
        checkTicket(
          party({ invites: [{ ...anna, used: true, usedAt: '21:40' }] }),
          scan({}),
          NOW,
        ),
      ).toMatchObject({ reason: 'already_used', invite: { usedAt: '21:40' } });
    });

    it('lets a paid guest of a paid party in', () => {
      const p = paidParty({ invites: [{ ...anna, paidAt: '2026-11-01' }] });
      expect(checkTicket(p, scan({}), NOW).ok).toBe(true);
    });
  });

  describe('a typed code', () => {
    it('lets the guest in on their code and name, forgiving case and spaces', () => {
      const p = party({ invites: [anna] });
      expect(checkTicket(p, typed(' ab-23c ', ' anna '), NOW)).toEqual({
        ok: true,
        invite: anna,
      });
    });

    it('works on a local party, whose guests’ codes were never stored', () => {
      // Used to fail: the door only looked up stored codes.
      const p = party({ invites: [guest({ id: 1, name: 'Anna' })] });
      expect(checkTicket(p, typed('K9NFJ', 'Anna'), NOW).ok).toBe(true);
    });

    it('needs a code-shaped code and a name', () => {
      const p = party({ invites: [anna] });
      expect(checkTicket(p, typed('AB2', 'Anna'), NOW)).toEqual({
        ok: false,
        reason: 'malformed',
      });
      expect(checkTicket(p, typed('AB23C', '  '), NOW)).toEqual({
        ok: false,
        reason: 'name_missing',
      });
    });

    it('refuses an unknown code', () => {
      expect(
        checkTicket(party({ invites: [anna] }), typed('ZZ23Z', 'Anna'), NOW),
      ).toEqual({ ok: false, reason: 'unknown_code' });
    });

    it('refuses a name that is not the code’s, without naming its guest', () => {
      expect(
        checkTicket(party({ invites: [anna] }), typed('AB23C', 'Bea'), NOW),
      ).toEqual({ ok: false, reason: 'name_mismatch' });
    });

    it('holds the same line as a scan on payment', () => {
      expect(
        checkTicket(
          paidParty({ invites: [anna] }),
          typed('AB23C', 'Anna'),
          NOW,
        ),
      ).toMatchObject({ reason: 'unpaid' });
    });
  });
});
