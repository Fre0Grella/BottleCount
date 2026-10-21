import { describe, expect, it } from 'vitest';
import { mailtoUrl, smsUrl, whatsappUrl } from './sendLinks';

const MESSAGE = 'Your ticket: https://x.test/t/#t=a&b';

describe('whatsappUrl', () => {
  it('opens the guest’s own chat when we have their number', () => {
    expect(whatsappUrl(MESSAGE, '+393331234567')).toBe(
      `https://wa.me/393331234567?text=${encodeURIComponent(MESSAGE)}`,
    );
  });

  it('lets the organiser pick the chat when we do not', () => {
    expect(whatsappUrl(MESSAGE, null)).toBe(
      `https://wa.me/?text=${encodeURIComponent(MESSAGE)}`,
    );
  });
});

describe('mailtoUrl', () => {
  it('addresses the guest and fills in the subject and body', () => {
    const url = mailtoUrl('Your ticket', MESSAGE, 'giulia@example.com');

    expect(url.startsWith('mailto:giulia@example.com?subject=')).toBe(true);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('subject')).toBe('Your ticket');
    expect(params.get('body')).toBe(MESSAGE);
  });

  it('keeps an odd address from spilling into the subject', () => {
    expect(mailtoUrl('s', 'b', 'a&b?c@example.com')).toMatch(
      /^mailto:a%26b%3Fc@example\.com\?subject=/,
    );
  });

  it('leaves the recipient blank without an email', () => {
    expect(mailtoUrl('s', 'b')).toMatch(/^mailto:\?subject=/);
  });
});

describe('smsUrl', () => {
  it('addresses the guest when we have their number', () => {
    expect(smsUrl('hi', '+393331234567')).toBe('sms:+393331234567?&body=hi');
  });

  it('works without one', () => {
    expect(smsUrl('hi')).toBe('sms:?&body=hi');
  });
});
