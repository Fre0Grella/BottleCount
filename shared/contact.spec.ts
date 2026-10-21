import { describe, expect, it } from 'vitest';
import { normaliseEmail, normalisePhone } from './contact';

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
