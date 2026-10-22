import { describe, expect, it } from 'vitest';
import { isTicketSlug, TICKET_SLUG_LENGTH } from '../../../shared/ticketLinks';
import { newSlug, newTicketSlug, newToken } from '../lib/tokens';

describe('newToken', () => {
  it('is 20 characters of the read-aloud alphabet', () => {
    expect(newToken()).toMatch(/^[abcdefghjkmnpqrstuvwxyz23456789]{20}$/);
  });
});

describe('newSlug', () => {
  it('is the readable name with a random tail', () => {
    expect(newSlug('Café Rooftop!')).toMatch(
      /^cafe-rooftop-[abcdefghjkmnpqrstuvwxyz23456789]{10}$/,
    );
    expect(newSlug('!!!')).toMatch(/^party-[a-z2-9]{10}$/);
  });
});

describe('newTicketSlug', () => {
  it('is long and random enough not to be guessed', () => {
    const slug = newTicketSlug();
    expect(slug).toHaveLength(TICKET_SLUG_LENGTH);
    expect(isTicketSlug(slug)).toBe(true);
  });
});
