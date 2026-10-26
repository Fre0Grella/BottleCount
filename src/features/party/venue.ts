import type { VenuePin } from '../../../shared/collab';

/**
 * Finding the venue on a map, and the link a guest opens it with.
 *
 * Search is Photon (komoot's geocoder over OpenStreetMap data): free, no key,
 * and built for type-ahead, which the public Nominatim server's one request a
 * second is not. Only the host's browser calls it, from the Plan tab; the
 * guest pages import this module for {@link mapsLink} alone and contact
 * nobody.
 *
 * No store or database imports: the invite page pulls this in.
 */

const PHOTON_URL = 'https://photon.komoot.io/api/';

/** Shorter queries match half the planet and only spend the shared server. */
export const MIN_QUERY_LENGTH = 3;

const MAX_HITS = 6;

/** A search result, in the shape the Plan tab fills the venue with. */
export interface VenueHit {
  place: string;
  city: string;
  pin: VenuePin;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function joined(parts: string[], separator: string): string {
  return parts.filter(Boolean).join(separator);
}

/**
 * Photon's GeoJSON answer, as hits. Total: a feature without coordinates or a
 * name is skipped, and anything that is not a feature collection is no hits.
 */
export function hitsFromPhoton(body: unknown): VenueHit[] {
  const features = (body as { features?: unknown } | null)?.features;
  if (!Array.isArray(features)) return [];

  const hits: VenueHit[] = [];
  for (const feature of features as {
    geometry?: { coordinates?: unknown };
    properties?: Record<string, unknown>;
  }[]) {
    const [lng, lat] = Array.isArray(feature?.geometry?.coordinates)
      ? (feature.geometry.coordinates as unknown[])
      : [];
    if (typeof lat !== 'number' || typeof lng !== 'number') continue;

    const p = feature.properties ?? {};
    const street = joined([text(p['street']), text(p['housenumber'])], ' ');
    // A town or a village is its own name; anything inside one names it.
    const city =
      text(p['city']) || (p['type'] === 'city' ? text(p['name']) : '');
    const place = text(p['name']) || street;
    if (!place) continue;

    hits.push({
      place,
      city,
      pin: {
        lat,
        lng,
        address: joined(
          [
            street,
            joined([text(p['postcode']), city], ' '),
            text(p['country']),
          ],
          ', ',
        ),
      },
    });
  }
  return hits;
}

/**
 * Venues matching `query`, or null when the search could not be reached
 * (offline, or Photon down) so the caller can say so rather than show "no
 * results". An aborted search, superseded by the next keystroke, is null too.
 */
export async function searchVenues(
  query: string,
  signal?: AbortSignal,
): Promise<VenueHit[] | null> {
  const q = query.trim();
  if (q.length < MIN_QUERY_LENGTH) return [];

  const url = `${PHOTON_URL}?${new URLSearchParams({ q, limit: String(MAX_HITS) })}`;
  try {
    const res = await fetch(url, { signal });
    if (!res.ok) return null;
    return hitsFromPhoton(await res.json());
  } catch {
    return null;
  }
}

/**
 * A link that opens the pin in the guest's maps app: Google's universal maps
 * URL opens the app where it is installed, on Android and iOS alike, and the
 * website everywhere else. The coordinates, not the name, so it lands on the
 * spot the host picked.
 */
export function mapsLink(pin: Pick<VenuePin, 'lat' | 'lng'>): string {
  const query = `${pin.lat},${pin.lng}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
