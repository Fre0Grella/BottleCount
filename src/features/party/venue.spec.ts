import { afterEach, describe, expect, it, vi } from 'vitest';
import { hitsFromPhoton, mapsLink, searchVenues } from './venue';

/** One Photon feature: GeoJSON, so the coordinates are `[lng, lat]`. */
function feature(
  properties: Record<string, unknown>,
  coordinates = [9.19, 45.46],
) {
  return {
    type: 'Feature',
    geometry: { type: 'Point', coordinates },
    properties,
  };
}

describe('hitsFromPhoton', () => {
  it('reads a venue with its address', () => {
    const body = {
      features: [
        feature({
          name: 'Terrazza Martini',
          street: 'Piazza Diaz',
          housenumber: '7',
          postcode: '20123',
          city: 'Milano',
          country: 'Italia',
          type: 'house',
        }),
      ],
    };
    expect(hitsFromPhoton(body)).toEqual([
      {
        place: 'Terrazza Martini',
        city: 'Milano',
        pin: {
          lat: 45.46,
          lng: 9.19,
          address: 'Piazza Diaz 7, 20123 Milano, Italia',
        },
      },
    ]);
  });

  it('names a street address by its street when it has no name', () => {
    const [hit] = hitsFromPhoton({
      features: [
        feature({ street: 'Via Roma', housenumber: '1', city: 'Bra' }),
      ],
    });
    expect(hit.place).toBe('Via Roma 1');
  });

  it('takes a town as its own city', () => {
    const [hit] = hitsFromPhoton({
      features: [feature({ name: 'Bra', type: 'city', country: 'Italia' })],
    });
    expect(hit).toMatchObject({ place: 'Bra', city: 'Bra' });
    expect(hit.pin.address).toBe('Bra, Italia');
  });

  it('skips features without coordinates or a name', () => {
    expect(
      hitsFromPhoton({
        features: [
          { properties: { name: 'Nowhere' } },
          feature({ name: 'Bad', city: 'X' }, ['9', '45'] as never),
          feature({ country: 'Italia' }),
        ],
      }),
    ).toEqual([]);
  });

  it('reads anything that is not a feature collection as no hits', () => {
    for (const body of [null, 'oops', {}, { features: 'no' }]) {
      expect(hitsFromPhoton(body)).toEqual([]);
    }
  });
});

describe('searchVenues', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('does not search for a query too short to mean anything', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    expect(await searchVenues(' ab ')).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('asks Photon and reads its answer', async () => {
    const fetch = vi.fn(async (_url: string) =>
      Response.json({ features: [feature({ name: 'Roof', city: 'Milan' })] }),
    );
    vi.stubGlobal('fetch', fetch);
    const hits = await searchVenues('roof milan');
    expect(hits?.map((h) => h.place)).toEqual(['Roof']);
    expect(String(fetch.mock.calls[0]?.[0])).toContain('q=roof+milan');
  });

  // Offline is not "no results": the Plan tab says the search is unreachable.
  it('answers null when the search cannot be reached', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      }),
    );
    expect(await searchVenues('roof milan')).toBeNull();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 503 })),
    );
    expect(await searchVenues('roof milan')).toBeNull();
  });
});

describe('mapsLink', () => {
  it('opens the pin by its coordinates', () => {
    expect(mapsLink({ lat: 45.46, lng: 9.19 })).toBe(
      'https://www.google.com/maps/search/?api=1&query=45.46%2C9.19',
    );
  });
});
