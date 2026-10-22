import type { PartyDocument, PartyRole } from '../../../shared/collab';
import { normaliseDocument } from '../../../shared/collab';
import type { MergePatch } from '../../../shared/patch';
import type { PublishPartyRequest } from '../../../shared/invites';
import type { Result } from './result';

export interface PublishedParty {
  id: string;
  ownerId: string;
  localId: number;
  slug: string;
  name: string;
  date: string;
  cover: number;
  venue: { place: string; city: string; time: string };
  allowForward: boolean;
  maxCapacity: number | null;
  rootToken: string;
  publishedAt: string;
  updatedAt: string;
  /** The planning half. Null on a party published before it was stored. */
  document: PartyDocument | null;
  version: number;
  /**
   * Whether guests may RSVP. Storing a party so a co-organiser can open it is
   * not the same as opening it to the world, so this is set by the invite link
   * and nothing else.
   */
  invitesOpen: boolean;
  /**
   * The party's ticket-signing key, as a JWK. Generated server-side when the
   * party is first stored; every member verifies with the same one, which is
   * what lets a second phone check a ticket the first phone issued.
   */
  ticketKey: JsonWebKey | null;
}

/** A party as it appears in somebody's list, with their role on it. */
export interface PartySummary {
  id: string;
  name: string;
  date: string;
  cover: number;
  role: PartyRole;
  version: number;
  updatedAt: string;
  memberCount: number;
}

/** The fields a party's card shows, which the row also keeps as columns. */
export type PartyCard = Pick<
  PublishedParty,
  'name' | 'date' | 'cover' | 'venue' | 'allowForward' | 'maxCapacity'
>;

/**
 * A stored document as callers get it: normalised, whatever the row holds.
 *
 * A co-organiser's merge patch is applied by the database and can delete any
 * key, so the stored JSON is not trusted to have the document's shape. A card
 * field patched away falls back to `published`, the card columns as the party
 * was last published, rather than to a blank: a party that lost its venue
 * shows the venue it was shared with, not none.
 */
export function readDocument(
  raw: Record<string, unknown>,
  published: PartyCard,
): PartyDocument {
  const kept = <T>(key: string, fallback: T): unknown =>
    raw[key] === undefined || raw[key] === null ? fallback : raw[key];

  const document = normaliseDocument({
    ...raw,
    date: kept('date', published.date),
    cover: kept('cover', published.cover),
    venue: kept('venue', published.venue),
    allowForward: kept('allowForward', published.allowForward),
    settings: kept('settings', { max_capacity: published.maxCapacity }),
  });
  if (document.name === '') document.name = published.name;
  return document;
}

/**
 * The card fields, read from the document. Believing only the document is what
 * keeps the card columns that duplicate it from ever disagreeing with it.
 */
export function cardOf(document: PartyDocument): PartyCard {
  return {
    name: document.name,
    date: document.date,
    cover: document.cover,
    venue: document.venue,
    allowForward: document.allowForward,
    maxCapacity: document.settings.max_capacity,
  };
}

export const PARTY_ERRORS = {
  NOT_FOUND: 'party_not_found',
  NOT_OWNER: 'party_not_owner',
  /** The party predates document storage and has nothing to patch yet. */
  NO_DOCUMENT: 'party_has_no_document',
} as const;

export interface PartyRepository {
  /**
   * Publishes or republishes. Keyed on (owner, localId), so a host editing a
   * party and sharing again updates the same row — and keeps the same slug, or
   * every link they already sent would break.
   */
  publish(
    ownerId: string,
    snapshot: PublishPartyRequest,
  ): Promise<Result<PublishedParty>>;
  findBySlug(slug: string): Promise<Result<PublishedParty>>;

  findById(id: string): Promise<Result<PublishedParty>>;

  /** Every party this user can open, owned or shared with them. */
  listForUser(userId: string): Promise<Result<PartySummary[]>>;

  /**
   * Applies a merge patch to the stored document and bumps the version.
   *
   * The read, the merge and the write are one statement, because two
   * co-organisers saving at the same moment must not both read the same
   * document and write back over each other — that is precisely the loss
   * patching exists to prevent.
   */
  patchDocument(args: {
    partyId: string;
    patch: MergePatch;
  }): Promise<
    Result<{ document: PartyDocument; version: number; updatedAt: string }>
  >;

  /** Opens or closes the guest-facing invite link without touching the party. */
  setInvitesOpen(id: string, open: boolean): Promise<Result<PublishedParty>>;

  /** Removes the party outright; members and invites cascade with it. */
  deleteById(id: string): Promise<Result<void>>;
}
