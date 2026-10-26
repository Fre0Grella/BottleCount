import { emptyCatalog } from '../../../shared/catalog';
import { emptyDetails } from '../../../shared/details';
import { emptyPaymentDetails } from '../../../shared/payments';
import settingsData from '../../data/settings.json';
import { localIsoDate } from '../../lib/dates';
import { withStoredTicketCodes } from '../tickets/ticket';
import type { Party, PartyMenu } from '../../lib/types';

/**
 * What a party starts with, and what a stored party is brought up to.
 *
 * One source for both on purpose: a field added to `Party` gets its default
 * here, and that default is then what a new party starts with *and* what a
 * party saved before the field existed reads as. Two lists drift — a new party
 * and an old one would disagree about what an absent field means.
 */

/** A new party, as the planner creates it. */
export function newParty(now: Date = new Date()): Party {
  return {
    name: 'New party',
    date: localIsoDate(now),
    createdAt: now.toISOString(),
    cover: 0,
    venue: { place: '', city: '', time: '21:00' },
    settings: {
      guests: 40,
      ticket_price: 15,
      venue_cost: 0,
      equipment_cost: 0,
      alcohol_ml_per_person: 50,
      buffer: 1.1,
      max_capacity: null,
    },
    menu: structuredClone((settingsData as { menu: PartyMenu }).menu),
    catalog: emptyCatalog(),
    locks: {},
    checked: {},
    allowForward: true,
    includeSnacks: true,
    barManaged: true,
    payment: emptyPaymentDetails(),
    details: emptyDetails(),
    invites: [],
    publication: null,
  };
}

/**
 * Brings a stored party up to the current shape, in place. Returns whether
 * anything changed, so a caller writes back only the parties that need it.
 *
 * Run by the database upgrade (`db.ts`) on every stored party, once, and again
 * by the store on load for anything that upgrade could not reach — a party
 * synced in from another device, or one the upgrade skipped. Idempotent, so
 * running it twice is harmless.
 */
export function upgradeParty(party: Party): boolean {
  const before = JSON.stringify(party);
  const defaults = newParty();
  const p = party as unknown as Record<string, unknown>;

  // Fields added after a party was first saved.
  for (const [key, value] of Object.entries(defaults)) {
    // A null publication means something — the party is local-only — so it
    // stays. Any other null is a field that was never written properly.
    const missing =
      p[key] === undefined || (p[key] === null && key !== 'publication');
    if (missing) p[key] = value;
  }
  const settings = party.settings as unknown as Record<string, unknown>;
  for (const [key, value] of Object.entries(defaults.settings)) {
    if (settings[key] === undefined) settings[key] = value;
  }
  if (!Array.isArray(party.invites)) party.invites = [];

  // Invite statuses were renamed when guests gained the ability to answer for
  // themselves: "accepted" became "confirmed", and "pending" — which used to
  // mean a guest the host had not heard back from — became "opened", which
  // means someone followed the link and stopped there. Parties saved before
  // that still hold the old words, and the funnel counts nothing without this.
  for (const invite of party.invites) {
    const legacy = invite.status as string;
    if (legacy === 'accepted') invite.status = 'confirmed';
    else if (legacy === 'pending') invite.status = 'opened';
  }

  // Local guests saved before their ticket code was: store the code their
  // ticket already carries, so renaming them no longer changes it.
  const coded = withStoredTicketCodes(party);
  if (coded) party.invites = coded;

  return JSON.stringify(party) !== before;
}
