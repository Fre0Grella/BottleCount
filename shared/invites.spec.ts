import { describe, expect, it } from 'vitest';
import type { PartyDocument } from './collab';
import { normaliseDocument } from './collab';
import { invitePartyOf } from './invites';

const context = { slug: 'rooftop-ab', full: false, googleSignIn: true };

function aDocument(): PartyDocument {
  const document = normaliseDocument({
    name: 'Rooftop',
    date: '2026-11-14',
    cover: 3,
    venue: { place: 'Terrazza', city: 'Milano', time: '21:00' },
  });
  document.photos.poster = 'abcdefghjkmnpqrstuvw';
  document.details.info.entry = '18+';
  return document;
}

describe('invitePartyOf', () => {
  // The Worker and the planner's preview both build the card with this.
  it('builds the card from the party and its document', () => {
    const document = aDocument();

    expect(invitePartyOf(document, document, context)).toEqual({
      slug: 'rooftop-ab',
      name: 'Rooftop',
      date: '2026-11-14',
      cover: 3,
      photos: { banner: '', poster: 'abcdefghjkmnpqrstuvw' },
      venue: { place: 'Terrazza', city: 'Milano', time: '21:00' },
      details: document.details,
      allowForward: true,
      full: false,
      paid: false,
      googleSignIn: true,
    });
  });

  it('shows nothing it would read from a document the party does not have', () => {
    const card = invitePartyOf(aDocument(), null, context);

    expect(card.photos).toEqual({ banner: '', poster: '' });
    expect(card.details.info.entry).toBe('');
    expect(card.paid).toBe(false);
  });
});
