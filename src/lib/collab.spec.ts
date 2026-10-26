import { reactive } from 'vue';
import { describe, expect, it } from 'vitest';
import { applyDocument, documentOf } from './collab';
import { emptyPaymentDetails } from '../../shared/payments';
import { emptyDetails } from '../../shared/details';
import type { Party } from './types';

function aParty(): Party {
  return {
    id: 1,
    name: 'Rooftop',
    date: '2026-10-01',
    createdAt: '2026-09-01T00:00:00.000Z',
    cover: 0,
    coverPhoto: '',
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
    catalog: { ingredients: {}, cocktails: {} },
    locks: {},
    checked: {},
    allowForward: true,
    includeSnacks: true,
    barManaged: true,
    payment: emptyPaymentDetails(),
    details: emptyDetails(),
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

describe('applyDocument', () => {
  it('gives empty payment details when the server copy predates them', () => {
    // A party published before payments existed has no `payment` on the
    // server. Copying that over left the Plan tab's card with nothing to save
    // into, and every pull wiped what the host had typed.
    const party = aParty();
    party.payment.paypal = 'marcog';
    const stale = documentOf(party) as unknown as Record<string, unknown>;
    delete stale['payment'];

    applyDocument(party, stale as never);

    expect(party.payment).toEqual(emptyPaymentDetails());
  });

  it('gives empty details when the server copy predates them', () => {
    // Same failure as payment: with no `details` the Plan tab's description
    // and practical info would have nothing to write into.
    const party = aParty();
    const stale = documentOf(party) as unknown as Record<string, unknown>;
    delete stale['details'];

    applyDocument(party, stale as never);

    expect(party.details).toEqual(emptyDetails());
  });

  it('fills in a payment the server only has part of', () => {
    // A merge patch onto a document without `payment` stores only the fields
    // that changed.
    const party = aParty();
    const partial = {
      ...documentOf(party),
      payment: { paypal: 'marcog' },
    };

    applyDocument(party, partial as never);

    expect(party.payment).toEqual({
      ...emptyPaymentDetails(),
      paypal: 'marcog',
    });
  });

  it('gives a whole party when a patch deleted settings or venue', () => {
    // RFC 7386 lets a patch delete any key; the server reads such a document
    // through normaliseDocument, and so does this, so neither side holds a
    // party without the fields every screen reads.
    const party = aParty();
    const broken = { ...documentOf(party), settings: null, venue: null };

    applyDocument(party, broken as never);

    expect(party.settings.buffer).toBe(1);
    expect(party.venue).toEqual({ place: '', city: '', time: '' });
  });
});
