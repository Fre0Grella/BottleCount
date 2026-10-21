import { describe, expect, it } from 'vitest';
import {
  formatIban,
  invitePayment,
  normaliseIban,
  normalisePaypal,
  normaliseRevolut,
  normaliseSatispay,
  paymentReference,
  paypalMeUrl,
  sanitisePaymentDetails,
} from './payments';

const VALID_IBAN = 'IT60X0542811101000000123456';

describe('normalisePaypal', () => {
  it.each([
    ['marcog', 'marcog'],
    ['@marcog', 'marcog'],
    ['paypal.me/marcog', 'marcog'],
    ['https://www.paypal.me/marcog/15EUR', 'marcog'],
    ['https://paypal.com/paypalme/marcog', 'marcog'],
    ['  marcog  ', 'marcog'],
  ])('reads %s as %s', (input, expected) => {
    expect(normalisePaypal(input)).toBe(expected);
  });

  it('treats blank as "not offered"', () => {
    expect(normalisePaypal('   ')).toBe('');
  });

  it.each([
    'marco galeri',
    'javascript:alert(1)',
    'https://evil.example/marcog',
    'a'.repeat(21),
  ])('rejects %s', (input) => {
    expect(normalisePaypal(input)).toBeNull();
  });
});

describe('normaliseSatispay', () => {
  it('accepts an https link on Satispay', () => {
    expect(normaliseSatispay('https://web.satispay.com/app/match/abc')).toBe(
      'https://web.satispay.com/app/match/abc',
    );
  });

  it.each([
    'http://web.satispay.com/app/match/abc',
    'https://satispay.com.evil.example/x',
    'https://evilsatispay.com/x',
    'javascript:alert(1)',
    'not a url',
  ])('rejects %s', (input) => {
    expect(normaliseSatispay(input)).toBeNull();
  });
});

describe('normaliseRevolut', () => {
  it.each([
    ['marcog', 'https://revolut.me/marcog'],
    ['@marcog', 'https://revolut.me/marcog'],
    ['revolut.me/marcog', 'https://revolut.me/marcog'],
    ['https://revolut.me/marcog', 'https://revolut.me/marcog'],
    ['  https://revolut.me/marcog  ', 'https://revolut.me/marcog'],
  ])('reads %s as %s', (input, expected) => {
    expect(normaliseRevolut(input)).toBe(expected);
  });

  it('treats blank as "not offered"', () => {
    expect(normaliseRevolut('  ')).toBe('');
  });

  it.each([
    'http://revolut.me/marcog',
    'https://revolut.me.evil.example/marcog',
    'https://evilrevolut.me/marcog',
    'javascript:alert(1)',
    'marco galeri',
  ])('rejects %s', (input) => {
    expect(normaliseRevolut(input)).toBeNull();
  });
});

describe('normaliseIban', () => {
  it('accepts a valid IBAN however it is spaced or cased', () => {
    expect(normaliseIban('it60 x054 2811 1010 0000 0123 456')).toBe(VALID_IBAN);
  });

  it('accepts other countries', () => {
    expect(normaliseIban('DE89 3704 0044 0532 0130 00')).toBe(
      'DE89370400440532013000',
    );
  });

  it('rejects a transposed pair of digits', () => {
    expect(normaliseIban('IT60X0542811101000000123465')).toBeNull();
  });

  it('rejects something that is not shaped like an IBAN', () => {
    expect(normaliseIban('12345')).toBeNull();
  });

  it('formats in groups of four', () => {
    expect(formatIban(VALID_IBAN)).toBe('IT60 X054 2811 1010 0000 0123 456');
  });
});

describe('sanitisePaymentDetails', () => {
  it('drops what does not validate and keeps the rest', () => {
    expect(
      sanitisePaymentDetails({
        paypal: 'javascript:alert(1)',
        satispay: 'https://web.satispay.com/x',
        revolut: 'https://revolut.me.evil.example/x',
        bank_holder: '  Marco   Galeri ',
        bank_iban: 'IT00X0000000000000000000000',
      }),
    ).toEqual({
      paypal: '',
      satispay: 'https://web.satispay.com/x',
      revolut: '',
      bank_holder: 'Marco Galeri',
      bank_iban: '',
    });
  });

  it('survives a document saved before payments existed', () => {
    expect(sanitisePaymentDetails(undefined)).toEqual({
      paypal: '',
      satispay: '',
      revolut: '',
      bank_holder: '',
      bank_iban: '',
    });
  });
});

describe('paypalMeUrl', () => {
  it('fills the amount in', () => {
    expect(paypalMeUrl('marcog', 15)).toBe('https://paypal.me/marcog/15EUR');
    expect(paypalMeUrl('marcog', 12.5)).toBe(
      'https://paypal.me/marcog/12.50EUR',
    );
  });

  it('leaves it out for a free party', () => {
    expect(paypalMeUrl('marcog', 0)).toBe('https://paypal.me/marcog');
  });
});

describe('invitePayment', () => {
  it('is null when the host offers no way to pay, whatever the price', () => {
    expect(invitePayment(15, undefined)).toBeNull();
  });

  it('builds every method the host set up', () => {
    expect(
      invitePayment(15, {
        paypal: 'marcog',
        satispay: 'https://web.satispay.com/x',
        revolut: 'marcog',
        bank_holder: 'Marco Galeri',
        bank_iban: VALID_IBAN,
      }),
    ).toEqual({
      price: 15,
      paypalUrl: 'https://paypal.me/marcog/15EUR',
      satispayUrl: 'https://web.satispay.com/x',
      revolutUrl: 'https://revolut.me/marcog',
      bank: { holder: 'Marco Galeri', iban: VALID_IBAN },
    });
  });

  it('offers Revolut on its own', () => {
    expect(invitePayment(15, { revolut: 'marcog' })?.revolutUrl).toBe(
      'https://revolut.me/marcog',
    );
  });

  it('offers no bank transfer without the holder', () => {
    expect(
      invitePayment(15, { bank_holder: '', bank_iban: VALID_IBAN }),
    ).toBeNull();
  });

  it('never offers a link that did not validate', () => {
    expect(
      invitePayment(15, { satispay: 'javascript:alert(1)', paypal: 'a b' }),
    ).toBeNull();
  });
});

describe('paymentReference', () => {
  it('names the party and the guest', () => {
    expect(paymentReference(' Rooftop ', 'Giulia  Rossi')).toBe(
      'Rooftop - Giulia Rossi',
    );
  });

  it('fits in a SEPA reference', () => {
    expect(paymentReference('x'.repeat(200), 'y').length).toBe(140);
  });
});
