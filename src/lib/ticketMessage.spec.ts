import { describe, expect, it } from 'vitest';
import { sendRoute, ticketEmailSubject, ticketMessage } from './ticketMessage';

describe('sendRoute', () => {
  it('goes straight to WhatsApp for a guest who left only a phone', () => {
    expect(sendRoute({ phone: '+393331234567' })).toBe('whatsapp');
  });

  it('goes straight to the mail app for a guest who left only an email', () => {
    expect(sendRoute({ email: 'giulia@example.com' })).toBe('email');
  });

  it('opens the Send sheet when there is a choice to make', () => {
    expect(
      sendRoute({ email: 'giulia@example.com', phone: '+393331234567' }),
    ).toBe('sheet');
  });

  it('opens the Send sheet when there is nowhere to send yet', () => {
    expect(sendRoute({})).toBe('sheet');
  });
});

describe('ticketMessage', () => {
  it('names the guest, the party and carries the link', () => {
    expect(
      ticketMessage(
        { name: 'Rooftop', date: '2026-11-14' },
        'Giulia',
        'https://x/t/#t=abc',
      ),
    ).toBe(
      "🎫 Giulia, you're on the list for Rooftop (14 Nov). Your ticket — show the QR at the door: https://x/t/#t=abc",
    );
  });

  it('has a subject for the mail app', () => {
    expect(ticketEmailSubject({ name: 'Rooftop' })).toBe(
      'Your ticket — Rooftop',
    );
  });
});
