import { update } from '../../store/storeState';
import type { VenueHit } from './venue';
import {
  amountFromInput,
  clampHeadcount,
  defaultCap,
  type CostKey,
} from './plan';

/**
 * The Plan tab's edits to the open party, and the party header's rename. The
 * rules they apply are in plan.ts.
 */

export function renameParty(name: string): void {
  update((p) => {
    p.name = name;
  });
}

export function setCover(index: number): void {
  update((p) => {
    p.cover = index;
  });
}

export function setVenue(
  field: 'place' | 'city' | 'time',
  value: string,
): void {
  update((p) => {
    p.venue[field] = value;
  });
}

/** A venue picked from the map search: its name, its city and its pin. */
export function pickVenue(hit: VenueHit): void {
  update((p) => {
    p.venue.place = hit.place;
    p.venue.city = hit.city;
    p.venue.pin = { ...hit.pin };
  });
}

/**
 * The pin dragged to the exact spot. The address stays the one the search
 * gave: a few metres along the street is still that address.
 */
export function movePin(lat: number, lng: number): void {
  update((p) => {
    if (p.venue.pin) p.venue.pin = { ...p.venue.pin, lat, lng };
  });
}

/** Back to a typed-in venue. The name and city stay. */
export function clearPin(): void {
  update((p) => {
    delete p.venue.pin;
  });
}

export function setDate(date: string): void {
  update((p) => {
    p.date = date;
  });
}

/** The expected guests, held to 1..MAX_GUESTS. */
export function setGuests(n: number): void {
  update((p) => {
    p.settings.guests = clampHeadcount(n);
  });
}

/** How hard it goes: the alcohol per person, in ml. */
export function setDrinkStrength(ml: number): void {
  update((p) => {
    p.settings.alcohol_ml_per_person = ml;
  });
}

export function setBuffer(buffer: number): void {
  update((p) => {
    p.settings.buffer = buffer;
  });
}

/** A money field, from what was typed into it. */
export function setCost(key: CostKey, raw: string): void {
  const amount = amountFromInput(key, raw);
  update((p) => {
    p.settings[key] = amount;
  });
}

/** Switches the headcount cap on, a little above the guests, or off. */
export function toggleMaxCapacity(): void {
  update((p) => {
    const { guests, max_capacity } = p.settings;
    p.settings.max_capacity = max_capacity == null ? defaultCap(guests) : null;
  });
}

/** The headcount cap, held to 1..MAX_GUESTS. */
export function setMaxCapacity(n: number): void {
  update((p) => {
    p.settings.max_capacity = clampHeadcount(n);
  });
}
