import { describe, expect, it } from 'vitest';
import {
  answerContact,
  GUEST_NAME_MAX,
  guestName,
  normaliseEmail,
  normalisePhone,
  optionalContact,
  requireContact,
} from './contact';

describe('normaliseEmail', () => {
  it('keeps one spelling per address', () => {
    expect(normaliseEmail('  Giulia.Rossi@Gmail.com ')).toBe(
      'giulia.rossi@gmail.com',
    );
  });

  it('treats blank as "not given"', () => {
    expect(normaliseEmail('   ')).toBe('');
  });

  it.each(['giulia', 'giulia@', '@gmail.com', 'giulia@gmail', 'a b@c.it'])(
    'rejects %s',
    (input) => {
      expect(normaliseEmail(input)).toBeNull();
    },
  );

  it('rejects an address longer than email allows', () => {
    expect(normaliseEmail(`${'a'.repeat(250)}@x.it`)).toBeNull();
  });
});

describe('normalisePhone', () => {
  it.each([
    ['+39 333 123 4567', '+393331234567'],
    ['0039 333-123-4567', '+393331234567'],
    ['333 123 4567', '+393331234567'],
    ['(333) 123.4567', '+393331234567'],
    ['+44 7700 900123', '+447700900123'],
  ])('reads %s as %s', (input, expected) => {
    expect(normalisePhone(input)).toBe(expected);
  });

  it('treats blank as "not given"', () => {
    expect(normalisePhone('  ')).toBe('');
  });

  it.each(['123', '+0 333 1234567', 'call me', '+39 333 123 4567 890 12'])(
    'rejects %s',
    (input) => {
      expect(normalisePhone(input)).toBeNull();
    },
  );
});

describe('requireContact', () => {
  it('takes an email alone', () => {
    expect(requireContact('giulia@example.com', '')).toEqual({
      email: 'giulia@example.com',
      phone: null,
    });
  });

  it('takes a phone alone', () => {
    expect(requireContact('', '333 123 4567')).toEqual({
      email: null,
      phone: '+393331234567',
    });
  });

  it('takes both', () => {
    expect(requireContact('giulia@example.com', '+393331234567')).toEqual({
      email: 'giulia@example.com',
      phone: '+393331234567',
    });
  });

  it('needs at least one', () => {
    expect(requireContact('  ', '')).toEqual({ error: 'contact_required' });
  });

  it('refuses whichever is given and wrong', () => {
    expect(requireContact('giulia', '+393331234567')).toEqual({
      error: 'invalid_email',
    });
    expect(requireContact('giulia@example.com', 'call me')).toEqual({
      error: 'invalid_phone',
    });
  });
});

describe('optionalContact', () => {
  it('lets both be blank, which clears them', () => {
    expect(optionalContact(' ', '')).toEqual({ email: null, phone: null });
  });

  it('still refuses whichever is given and wrong', () => {
    expect(optionalContact('giulia', '')).toEqual({ error: 'invalid_email' });
    expect(optionalContact('', 'call me')).toEqual({ error: 'invalid_phone' });
  });
});

describe('answerContact', () => {
  it('keeps nothing unless it is a yes to a paid party', () => {
    const none = { email: null, phone: null };
    expect(answerContact(false, true, 'g@example.com', '')).toEqual(none);
    expect(answerContact(true, false, 'g@example.com', '')).toEqual(none);
  });

  it('needs one of the two for a yes to a paid party', () => {
    expect(answerContact(true, true, '', '')).toEqual({
      error: 'contact_required',
    });
    expect(answerContact(true, true, 'G@Example.com', '')).toEqual({
      email: 'g@example.com',
      phone: null,
    });
  });
});

describe('guestName', () => {
  it('trims and bounds the name', () => {
    expect(guestName('  Giulia  ')).toBe('Giulia');
    expect(guestName('x'.repeat(100))).toHaveLength(GUEST_NAME_MAX);
  });
});
