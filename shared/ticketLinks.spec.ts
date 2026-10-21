import { describe, expect, it } from 'vitest';
import {
  isTicketSlug,
  newTicketSlug,
  signedTicketCode,
  TICKET_SLUG_LENGTH,
} from './ticketLinks';

function signed(payload: unknown): string {
  return `${btoa(JSON.stringify(payload))}.${btoa('signature-bytes')}`;
}

describe('newTicketSlug', () => {
  it('is long and random enough not to be guessed', () => {
    const slug = newTicketSlug();
    expect(slug).toHaveLength(TICKET_SLUG_LENGTH);
    expect(isTicketSlug(slug)).toBe(true);
  });
});

describe('isTicketSlug', () => {
  it.each(['', 'xqk8', 'ABCDEFGHJKMN', '0123456789ab/', 'iiiiiiiiiiii'])(
    'rejects %s',
    (value) => {
      expect(isTicketSlug(value)).toBe(false);
    },
  );
});

describe('signedTicketCode', () => {
  it('reads the code out of a signed ticket', () => {
    expect(
      signedTicketCode(
        signed({
          code: 'AB23C',
          partyId: 'p',
          guestName: 'Giulia',
          expiresAt: 'x',
        }),
      ),
    ).toBe('AB23C');
  });

  it.each([
    'not a ticket',
    'only-one-part',
    'a.b.c',
    `${btoa('not json')}.${btoa('sig')}`,
    `${btoa(JSON.stringify({ name: 'no code' }))}.${btoa('sig')}`,
    `${'A'.repeat(3000)}.${btoa('sig')}`,
  ])('refuses %s', (value) => {
    expect(signedTicketCode(value)).toBeNull();
  });
});
