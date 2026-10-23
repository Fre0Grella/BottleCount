import { update } from '../../store/storeState';
import type { Party } from '../../lib/types';
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

export function setVenue(field: keyof Party['venue'], value: string): void {
  update((p) => {
    p.venue[field] = value;
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
