import type { Catalog } from './catalog';
import { normaliseCatalog } from './catalog';
import type { PartyPhotos } from './coverPhotos';
import { normalisePhotos } from './coverPhotos';
import type { PartyDetails } from './details';
import { normaliseDetails } from './details';
import type { FeatureSet } from './tiers';
import type { MergePatch } from './patch';
import type { PaymentDetails } from './payments';
import { sanitisePaymentDetails } from './payments';

/**
 * Co-organisers: the contract for a party two people run together.
 *
 * ADR 0001 kept every party in the host's browser and ADR 0002 published only
 * the invitation card. Neither is enough here — a second organiser opens the
 * party on their own device and needs the menu, the numbers and the shopping
 * list, not a poster. This is the shape that travels.
 */

// ── Roles ───────────────────────────────────────────────────────────────────

export const PARTY_ROLES = ['owner', 'editor'] as const;

/**
 * `owner` is whoever created the party. `editor` is a co-organiser: they may
 * change anything about the party itself, and may not delete it, unpublish it,
 * or add and remove people. Those stay with the owner, because they are the
 * actions that take the party away from everybody else.
 */
export type PartyRole = (typeof PARTY_ROLES)[number];

export function isPartyRole(value: unknown): value is PartyRole {
  return (
    typeof value === 'string' &&
    (PARTY_ROLES as readonly string[]).includes(value)
  );
}

// ── The synced document ─────────────────────────────────────────────────────

/**
 * Where the venue is on a map, when the host picked it from the search rather
 * than only typing it. One object so the coordinates and the address they came
 * with are set and cleared together.
 */
export interface VenuePin {
  lat: number;
  lng: number;
  /** The address the search gave, for display. May be ''. */
  address: string;
}

/**
 * Where and when. `place` and `city` are what the host typed (or the search
 * filled in) and always work, offline included; `pin` is absent until a venue
 * is picked on the map.
 */
export interface Venue {
  place: string;
  city: string;
  /** When it starts, `HH:MM`. */
  time: string;
  /** When it ends, `HH:MM`. Absent for an open-ended party. */
  endTime?: string;
  pin?: VenuePin;
}

/**
 * The part of a party that is shared.
 *
 * Everything an organiser plans with, and nothing else. Two deliberate
 * omissions:
 *
 * - **`invites`** — the guest list lives in its own table and arrives through
 *   the funnel. Keeping it out is what leaves this document free of arrays,
 *   which is what lets merge patches work (see `patch.ts`).
 * - **`id`, `createdAt`, `publication`** — each browser's own bookkeeping. A
 *   collaborator's local id for a party is theirs alone and means nothing to
 *   anyone else.
 */
export interface PartyDocument {
  name: string;
  date: string;
  cover: number;
  /**
   * The party's own banner and poster in R2, by token, '' for none (ADR 0007).
   * Each is set by the Worker once it has stored the photo.
   */
  photos: PartyPhotos;
  venue: Venue;
  settings: {
    guests: number;
    ticket_price: number;
    venue_cost: number;
    /** Per guest, on top of `venue_cost`. Absent on older documents: no fee. */
    venue_fee_per_person?: number;
    equipment_cost: number;
    alcohol_ml_per_person: number;
    buffer: number;
    max_capacity: number | null;
  };
  /** `Record<category, { macro_pct, spirits: Record<spirit, …> }>`. */
  menu: Record<string, unknown>;
  /**
   * Copies of the catalog entries the menu uses that are not preset or whose
   * price differs (shared/catalog.ts). Absent on older documents: empty.
   */
  catalog: Catalog;
  locks: Record<string, boolean>;
  checked: Record<string, boolean>;
  allowForward: boolean;
  includeSnacks: boolean;
  /**
   * False when the venue runs the bar, which switches off all drink planning.
   * The menu is kept, so turning it back on restores it. Absent on documents
   * stored before it existed, which read as true.
   */
  barManaged: boolean;
  /** Where guests pay the host. Public to confirmed guests; see `payments.ts`. */
  payment: PaymentDetails;
  /** The description and practical info. Public to the link; see `details.ts`. */
  details: PartyDetails;
}

/** The fields of a local `Party` that belong in the shared document. */
export const DOCUMENT_FIELDS = [
  'name',
  'date',
  'cover',
  'photos',
  'venue',
  'settings',
  'menu',
  'catalog',
  'locks',
  'checked',
  'allowForward',
  'includeSnacks',
  'barManaged',
  'payment',
  'details',
] as const satisfies readonly (keyof PartyDocument)[];

function str(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function num(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function record(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function within(value: unknown, limit: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= limit
  );
}

/** A pin with real coordinates, or undefined: half a pin is no pin. */
function normalisePin(value: unknown): VenuePin | undefined {
  const pin = record(value);
  if (!within(pin['lat'], 90) || !within(pin['lng'], 180)) return undefined;
  return {
    lat: pin['lat'],
    lng: pin['lng'],
    address: str(pin['address'], 200),
  };
}

/** The venue, its end time and pin left off entirely when there are none. */
function normaliseVenue(value: unknown): Venue {
  const venue = record(value);
  const endTime = str(venue['endTime'], 10);
  const pin = normalisePin(venue['pin']);
  return {
    place: str(venue['place'], 120),
    city: str(venue['city'], 80),
    time: str(venue['time'], 10),
    ...(endTime && { endTime }),
    ...(pin && { pin }),
  };
}

/**
 * Any value, made into a document the rest of the code can rely on.
 *
 * The one place a document gets its shape. A publish passes through it, and so
 * does every stored document on its way out: a co-organiser's merge patch is
 * applied by the database without passing any check, and RFC 7386 lets it
 * delete a key outright — `{"settings": null}` would otherwise leave a party
 * that throws on every read, so nobody can open it or even delete it.
 *
 * Total on purpose: a missing or mistyped field takes its default rather than
 * failing the whole document, and strings are bounded because they end up on a
 * page anyone with the invite link can open. The name may come back empty;
 * refusing that is the publish's call (see `routes/partyInput.ts`).
 */
export function normaliseDocument(value: unknown): PartyDocument {
  const d = record(value);
  const settings = record(d['settings']);

  return {
    name: str(d['name'], 80).trim(),
    date: str(d['date'], 10),
    cover: Math.max(0, Math.min(5, Math.trunc(num(d['cover'], 0)))),
    photos: normalisePhotos(d['photos'], d['coverPhoto']),
    venue: normaliseVenue(d['venue']),
    settings: {
      guests: num(settings['guests'], 0),
      ticket_price: num(settings['ticket_price'], 0),
      venue_cost: num(settings['venue_cost'], 0),
      venue_fee_per_person: Math.max(
        0,
        num(settings['venue_fee_per_person'], 0),
      ),
      equipment_cost: num(settings['equipment_cost'], 0),
      alcohol_ml_per_person: num(settings['alcohol_ml_per_person'], 0),
      buffer: num(settings['buffer'], 1),
      max_capacity:
        typeof settings['max_capacity'] === 'number' &&
        Number.isFinite(settings['max_capacity'])
          ? Math.max(1, Math.round(settings['max_capacity']))
          : null,
    },
    menu: record(d['menu']),
    catalog: normaliseCatalog(d['catalog']),
    locks: record(d['locks']) as Record<string, boolean>,
    checked: record(d['checked']) as Record<string, boolean>,
    allowForward: d['allowForward'] !== false,
    includeSnacks: d['includeSnacks'] !== false,
    barManaged: d['barManaged'] !== false,
    // These end up on a page every confirmed guest opens, so an identifier that
    // does not validate is dropped rather than stored.
    payment: sanitisePaymentDetails(d['payment']),
    details: normaliseDetails(d['details']),
  };
}

// ── Members ─────────────────────────────────────────────────────────────────

export interface PartyMemberDTO {
  userId: string;
  email: string;
  name: string | null;
  picture: string | null;
  role: PartyRole;
  addedAt: string;
}

// ── What the client reads and writes ────────────────────────────────────────

export interface SharedPartyDTO {
  id: string;
  document: PartyDocument;
  /**
   * Bumped on every accepted write. The client sends the version it was working
   * from so the server can tell it when it has fallen behind — not to reject
   * the write, but so the client knows to pull before assuming it is current.
   */
  version: number;
  role: PartyRole;
  members: PartyMemberDTO[];
  updatedAt: string;
  /** Present once the invite link is on, so a collaborator can share it too. */
  publication: { slug: string; rootToken: string } | null;
  /**
   * The party's ticket-signing key, as a JWK.
   *
   * Handed to every member because every member may work the door, and a phone
   * that cannot verify is a phone that rejects real guests. It is a shared
   * secret among organisers: holding it means being able to mint a ticket, and
   * anyone who holds it can already add a guest through the API, so it grants
   * nothing they did not have. It is never sent to a guest.
   */
  ticketKey: JsonWebKey | null;
  /**
   * What this party may do, from its **owner's** tier — not the caller's. A
   * free co-organiser of a Pro party gets the Pro features within it (see
   * `canUse` in `shared/tiers.ts`).
   */
  features: FeatureSet;
}

/** One entry in the list of parties a user can open. */
export interface PartySummaryDTO {
  id: string;
  name: string;
  date: string;
  cover: number;
  role: PartyRole;
  version: number;
  updatedAt: string;
  memberCount: number;
}

export interface PatchPartyRequest {
  /** What the client believes it is patching. Reported back, never enforced. */
  baseVersion: number;
  patch: MergePatch;
}

export interface PatchPartyResponse {
  version: number;
  /**
   * The full document, returned when the client's `baseVersion` was stale — it
   * had not seen somebody else's edit yet. Null when it was current, so the
   * common case costs nothing.
   */
  document: PartyDocument | null;
  updatedAt: string;
}

// ── Inviting a co-organiser ─────────────────────────────────────────────────

export interface CollaboratorInviteDTO {
  token: string;
  createdAt: string;
}

/** What someone sees before they accept, so they know what they are joining. */
export interface CollaboratorPreviewDTO {
  partyName: string;
  date: string;
  cover: number;
  invitedBy: string;
  /** True when this user is already on the party — the link is then a no-op. */
  alreadyMember: boolean;
}
