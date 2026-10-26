import { describe, expect, it } from 'vitest';
import { normaliseDocument } from '../../../shared/collab';
import { parseDocument } from '../routes/partyInput';
import { aDocument } from './support/party';

function parsed(document: Record<string, unknown>) {
  return parseDocument({ localId: 1, document })?.document;
}

describe('parseDocument', () => {
  describe('barManaged', () => {
    // The document is rebuilt field by field, so a field this does not name is
    // silently dropped — and a co-organiser would never see the switch.
    it('keeps "the venue runs the bar"', () => {
      expect(parsed({ ...aDocument(), barManaged: false })?.barManaged).toBe(
        false,
      );
    });

    it('reads a document from before the switch as the host running the bar', () => {
      const { barManaged: _omitted, ...older } = aDocument();
      expect(parsed(older)?.barManaged).toBe(true);
    });

    it('treats anything but false as true', () => {
      expect(parsed({ ...aDocument(), barManaged: 'no' })?.barManaged).toBe(
        true,
      );
    });
  });

  describe('catalog', () => {
    // A party carries copies of the entries it uses that are not preset, so a
    // co-organiser computes the same costs (shared/catalog.ts).
    it('keeps the party catalog copies', () => {
      const catalog = {
        ingredients: {
          'House Gin 70cl': {
            type: 'spirit',
            abv: 0.42,
            price_min: 18,
            price_max: 22,
          },
        },
        cocktails: {},
      };
      expect(parsed({ ...aDocument(), catalog })?.catalog).toEqual(catalog);
    });

    it('reads a document from before the field as an empty catalog', () => {
      const { catalog: _omitted, ...older } = aDocument();
      expect(parsed(older)?.catalog).toEqual({
        ingredients: {},
        cocktails: {},
      });
    });

    it('drops entries that are not an ingredient', () => {
      const catalog = {
        ingredients: { Bad: { type: 'potion' } },
        cocktails: 7,
      };
      expect(parsed({ ...aDocument(), catalog })?.catalog).toEqual({
        ingredients: {},
        cocktails: {},
      });
    });
  });
});

describe('normaliseDocument', () => {
  it('leaves a whole document as it was', () => {
    const document = {
      ...aDocument(),
      settings: { ...aDocument().settings, venue_fee_per_person: 2 },
    };
    expect(normaliseDocument(document)).toEqual(document);
  });

  it('makes a document out of anything at all', () => {
    for (const value of [null, undefined, 'party', 42, [], {}]) {
      const document = normaliseDocument(value);
      expect(document.settings.buffer).toBe(1);
      expect(document.venue).toEqual({ place: '', city: '', time: '' });
      expect(document.payment.paypal).toBe('');
    }
  });

  describe('photos', () => {
    const TOKEN = 'abcdefghjkmnpqrstuvw';
    const photos = (document: Record<string, unknown>) =>
      normaliseDocument({ ...aDocument(), ...document }).photos;

    it('keeps a token the Worker gave out, in its slot', () => {
      expect(photos({ photos: { banner: TOKEN, poster: '' } })).toEqual({
        banner: TOKEN,
        poster: '',
      });
    });

    // The token becomes part of an R2 key and a URL: nothing else gets in.
    it('drops anything that is not a token, and slots it does not know', () => {
      for (const value of ['../other-party/x', 'short', 42, null, undefined]) {
        expect(photos({ photos: { banner: value, poster: value } })).toEqual({
          banner: '',
          poster: '',
        });
      }
      expect(photos({ photos: { logo: TOKEN } })).not.toHaveProperty('logo');
    });

    // Before slots there was one photo, and it was shown as the poster.
    it('reads the single photo of an older document as its poster', () => {
      expect(photos({ photos: undefined, coverPhoto: TOKEN })).toEqual({
        banner: '',
        poster: TOKEN,
      });
    });
  });

  describe('venue pin', () => {
    const venue = { place: 'Roof', city: 'Milan', time: '21:00' };
    const pinned = (pin: unknown) =>
      normaliseDocument({ ...aDocument(), venue: { ...venue, pin } }).venue;

    // A co-organiser and the invite page both read it from here.
    it('keeps a picked pin', () => {
      const pin = { lat: 45.46, lng: 9.19, address: 'Via Roma 1, Milan' };
      expect(pinned(pin)).toEqual({ ...venue, pin });
    });

    it('keeps an end time, and leaves it off when there is none', () => {
      const ends = (endTime: unknown) =>
        normaliseDocument({ ...aDocument(), venue: { ...venue, endTime } })
          .venue;
      expect(ends('03:00')).toEqual({ ...venue, endTime: '03:00' });
      expect(ends('')).toEqual(venue);
      expect(ends(7)).toEqual(venue);
    });

    it('leaves the pin off a venue that was only typed', () => {
      expect(pinned(undefined)).toEqual(venue);
    });

    it('drops a pin whose coordinates are missing or off the globe', () => {
      for (const pin of [
        { lat: 45 },
        { lat: '45', lng: '9' },
        { lat: 91, lng: 9 },
        { lat: 45, lng: -181 },
        { lat: Number.NaN, lng: 9 },
        'Milan',
      ]) {
        expect(pinned(pin)).not.toHaveProperty('pin');
      }
    });

    it('bounds the address, which a guest page shows', () => {
      const address = 'x'.repeat(500);
      expect(pinned({ lat: 1, lng: 2, address })?.pin?.address).toHaveLength(
        200,
      );
    });
  });

  it('drops fields the document does not own', () => {
    expect(
      normaliseDocument({ ...aDocument(), owner: 'x' }),
    ).not.toHaveProperty('owner');
  });
});

describe('parseDocument', () => {
  it('refuses a document without a name', () => {
    expect(parsed({ ...aDocument(), name: '   ' })).toBeUndefined();
  });
});
