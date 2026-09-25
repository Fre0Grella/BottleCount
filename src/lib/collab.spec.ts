import { reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import { documentOf } from './collab';
import type { Party } from './types';

function aParty(): Party {
  return {
    id: 1,
    name: 'Rooftop',
    date: '2026-10-01',
    createdAt: '2026-09-01T00:00:00.000Z',
    cover: 0,
    venue: { place: 'Roof', city: 'Milan', time: '21:00' },
    settings: {
      guests: 40,
      ticket_price: 15,
      venue_cost: 0,
      equipment_cost: 0,
      alcohol_ml_per_person: 50,
      buffer: 1.1,
      max_capacity: null,
    },
    menu: {},
    locks: {},
    checked: {},
    allowForward: true,
    includeSnacks: true,
    invites: [],
  };
}

describe('documentOf', () => {
  it('accepts the reactive party the store hands out', () => {
    // Every caller passes `store.activeParty()`, which is a Vue proxy, and so
    // is every object reached through it. structuredClone refuses a Proxy, so
    // cloning field by field threw on every publish — no invite link was ever
    // created.
    const party = reactive(aParty()) as Party;

    const document = documentOf(party);

    expect(document.name).toBe('Rooftop');
    expect(document.venue).toEqual({
      place: 'Roof',
      city: 'Milan',
      time: '21:00',
    });
  });

  it('copies rather than aliases, so later edits do not leak into it', () => {
    const party = reactive(aParty()) as Party;

    const document = documentOf(party);
    party.venue.city = 'Turin';

    expect(document.venue.city).toBe('Milan');
  });

  it('leaves local-only fields behind', () => {
    const document = documentOf(aParty()) as unknown as Record<string, unknown>;

    expect(document).not.toHaveProperty('invites');
    expect(document).not.toHaveProperty('id');
  });
});
