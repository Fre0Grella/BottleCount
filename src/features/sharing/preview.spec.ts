import { describe, expect, it } from 'vitest';
import { newParty } from '../party/partyDefaults';
import type { Invite, Party } from '../../lib/types';
import { previewInvite, previewPhotoUrl, sampleGuestName } from './preview';

const TOKEN = 'abcdefghjkmnpqrstuvw';

function aParty(over: Partial<Party> = {}): Party {
  return { ...newParty(new Date('2026-10-26T12:00:00Z')), ...over };
}

describe('previewInvite', () => {
  it('shows the party as the guest card does', () => {
    const party = aParty({
      name: 'Rooftop',
      date: '2026-11-14',
      cover: 2,
      venue: { place: 'Terrazza', city: 'Milano', time: '21:00' },
    });
    party.details.description = 'Sunset on the roof.';
    party.photos.banner = TOKEN;

    expect(previewInvite(party)).toMatchObject({
      name: 'Rooftop',
      date: '2026-11-14',
      cover: 2,
      venue: { place: 'Terrazza', city: 'Milano', time: '21:00' },
      photos: { banner: TOKEN, poster: '' },
      details: { description: 'Sunset on the roof.' },
      full: false,
    });
  });

  it('says a party with a price and a way to pay is a paid one', () => {
    const party = aParty();
    party.settings.ticket_price = 15;
    party.payment.paypal = 'marcog';

    expect(previewInvite(party).paid).toBe(true);
  });
});

describe('previewPhotoUrl', () => {
  it('fetches photos the organiser way, once the party is stored', () => {
    const stored = aParty({
      publication: {
        remoteId: 'p1',
        version: 1,
        slug: null,
        rootToken: null,
        ticketKey: null,
        publishedAt: '2026-10-26T12:00:00Z',
      },
    } as Partial<Party>);

    expect(previewPhotoUrl(stored)('banner', TOKEN)).toBe(
      `/api/parties/p1/photos/banner/${TOKEN}`,
    );
    expect(previewPhotoUrl(aParty())('banner', TOKEN)).toBeNull();
  });
});

describe('sampleGuestName', () => {
  it('makes the ticket out to the first named guest, or a stand-in', () => {
    const guest = { name: '  Giulia ' } as Invite;
    expect(sampleGuestName(aParty({ invites: [guest] }))).toBe('Giulia');
    expect(sampleGuestName(aParty())).toBe('Your guest');
  });
});
