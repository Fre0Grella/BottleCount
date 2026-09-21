import { describe, expect, it } from 'vitest';
import {
  generateTicketCode,
  isTicketCode,
  normaliseTicketCode,
  TICKET_CODE_ALPHABET,
  TICKET_CODE_LENGTH,
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

  it('does not repeat itself', () => {
    const codes = new Set(
      Array.from({ length: 1000 }, () => generateTicketCode()),
    );
    // A handful of collisions in 1000 draws from 24M would still be suspicious.
    expect(codes.size).toBe(1000);
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
