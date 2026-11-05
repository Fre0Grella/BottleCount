import { describe, expect, it } from 'vitest';
import { inviteMessage } from './inviteMessage';

describe('inviteMessage', () => {
  const party = { name: 'Rooftop', date: '2026-11-14' };

  it('names the party, the day and the place, then the link', () => {
    expect(inviteMessage(party, 'Milano', 'https://x/i/a')).toBe(
      "You're invited to Rooftop on 14 Nov at Milano (^_^)/ Let me know if you're coming: https://x/i/a",
    );
  });

  it('leaves the place out when there is none', () => {
    expect(inviteMessage(party, '', 'L')).not.toContain(' at ');
  });

  it('is plain ASCII, so it reads right on any phone', () => {
    expect(inviteMessage(party, 'Milano', 'L')).toMatch(/^[\x20-\x7E]*$/);
  });
});
