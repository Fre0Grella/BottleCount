import { describe, expect, it } from 'vitest';
import type { PartyDocument } from './collab';
import type { TicketQRPayload } from './tickets';
import {
  encodeTicketPayload,
  generateTicketCode,
  isTicketCode,
  normaliseTicketCode,
  parseSignedTicket,
  TICKET_CODE_ALPHABET,
  TICKET_CODE_LENGTH,
  ticketState,
} from './tickets';

describe('the ticket code alphabet', () => {
  it('excludes every character that is mistaken for another', () => {
    // These are read off a phone in the dark and typed by someone holding a
    // clipboard. Each of these has a look-alike that is in the alphabet.
    for (const confusable of ['0', '1', 'I', 'L', 'O', 'U']) {
      expect(TICKET_CODE_ALPHABET).not.toContain(confusable);
    }
  });

  it('is long enough that a party will not collide in practice', () => {
    // 30^5 ≈ 24 million, against a few hundred guests.
    expect(TICKET_CODE_ALPHABET.length ** TICKET_CODE_LENGTH).toBeGreaterThan(
      10_000_000,
    );
  });
});

describe('generateTicketCode', () => {
  it('produces codes of the right shape', () => {
    for (let i = 0; i < 200; i++) {
      expect(isTicketCode(generateTicketCode())).toBe(true);
    }
  });

  it('draws every character of the alphabet given enough codes', () => {
    // The rejection sampling exists so no character is rarer than the rest; a
    // `%` fold would quietly favour the first few.
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      for (const c of generateTicketCode()) seen.add(c);
    }
    expect(seen.size).toBe(TICKET_CODE_ALPHABET.length);
  });
});

describe('normaliseTicketCode', () => {
  it('forgives case, spaces and hyphens', () => {
    expect(normaliseTicketCode(' a b-c 2 3 ')).toBe('ABC23');
  });

  it('does not guess at characters outside the alphabet', () => {
    // An earlier version folded O onto Q and I onto J. Both are absent from the
    // alphabet precisely so that ambiguity cannot arise, so guessing can only
    // turn a correct rejection into the wrong guest walking in.
    expect(isTicketCode(normaliseTicketCode('OIOIO'))).toBe(false);
    expect(normaliseTicketCode('QJQJQ')).toBe('QJQJQ');
  });

  it('caps the length so a paste cannot smuggle a longer string through', () => {
    expect(normaliseTicketCode('ABCDEFGHIJ')).toHaveLength(TICKET_CODE_LENGTH);
  });
});

describe('isTicketCode', () => {
  it('rejects anything that is not exactly a code', () => {
    expect(isTicketCode('ABC2')).toBe(false);
    expect(isTicketCode('ABC234')).toBe(false);
    expect(isTicketCode('ABC2O')).toBe(false);
    expect(isTicketCode('abc23')).toBe(false);
    expect(isTicketCode(12345)).toBe(false);
    expect(isTicketCode(null)).toBe(false);
  });
});

const payload = (guestName: string): TicketQRPayload => ({
  code: 'AB23C',
  partyId: 'party-1',
  guestName,
  expiresAt: '2026-11-15T05:00:00.000Z',
});

describe('encodeTicketPayload', () => {
  it('is the same bytes as before for a plain ASCII name', () => {
    expect(encodeTicketPayload(payload('Giulia'))).toBe(
      btoa(JSON.stringify(payload('Giulia'))),
    );
  });

  it('encodes any name, Latin-1 or not (#18)', () => {
    for (const name of ['Zoë', 'Łukasz', '王小明', 'Ana 🎉']) {
      const signed = `${encodeTicketPayload(payload(name))}.${btoa('sig')}`;
      expect(parseSignedTicket(signed)?.payload).toEqual(payload(name));
    }
  });
});

describe('parseSignedTicket', () => {
  it('reads a ticket issued before #18 with a Latin-1 name', () => {
    // btoa takes a Latin-1 string as bytes: exactly how those were written.
    const signed = `${btoa(JSON.stringify(payload('Zoë Ñúñez')))}.${btoa('sig')}`;
    expect(parseSignedTicket(signed)?.payload.guestName).toBe('Zoë Ñúñez');
  });

  it('keeps both readings when Latin-1 bytes are also valid UTF-8', () => {
    // "Ã©" in Latin-1 is C3 A9, which is also "é" in UTF-8. The signature
    // decides which was meant; the parser hands it both.
    const signed = `${btoa(JSON.stringify(payload('Ã©')))}.${btoa('sig')}`;
    expect(parseSignedTicket(signed)?.readings.map((r) => r.guestName)).toEqual(
      ['é', 'Ã©'],
    );
  });

  it.each([
    'not a ticket',
    'only-one-part',
    'a.b.c',
    `${btoa('not json')}.${btoa('sig')}`,
    `${btoa(JSON.stringify({ code: 'AB23C' }))}.${btoa('sig')}`,
    `${btoa(JSON.stringify(payload('x')))}.not base64!`,
    `${'A'.repeat(3000)}.${btoa('sig')}`,
  ])('refuses %s', (value) => {
    expect(parseSignedTicket(value)).toBeNull();
  });
});

describe('ticketState', () => {
  const paid = {
    settings: { ticket_price: 15 },
    payment: { paypal: 'marcog' },
  } as unknown as Pick<PartyDocument, 'settings' | 'payment'>;
  const free = {
    settings: { ticket_price: 0 },
    payment: {},
  } as unknown as Pick<PartyDocument, 'settings' | 'payment'>;

  it('has no ticket for anyone who is not coming', () => {
    expect(ticketState({ status: 'opened' }, free)).toBe('none');
    expect(ticketState({ status: 'declined', paidAt: 'x' }, paid)).toBe('none');
  });

  it('gives every confirmed guest of a free party a ticket', () => {
    expect(ticketState({ status: 'confirmed' }, free)).toBe('live');
  });

  it("holds a paid party's ticket back until the guest has paid", () => {
    expect(ticketState({ status: 'confirmed' }, paid)).toBe('unpaid');
    expect(ticketState({ status: 'confirmed', paidAt: null }, paid)).toBe(
      'unpaid',
    );
    expect(
      ticketState({ status: 'confirmed', paidAt: '2026-11-01T10:00Z' }, paid),
    ).toBe('live');
  });

  it('treats a party with no stored document as free', () => {
    expect(ticketState({ status: 'confirmed', paidAt: null }, null)).toBe(
      'live',
    );
  });
});
