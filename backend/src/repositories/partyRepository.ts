import type { PartyDocument, PartyRole } from '../../../shared/collab';
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

  /** Writes the whole document, for a party being published the first time. */
  putDocument(args: {
    partyId: string;
    document: PartyDocument;
  }): Promise<Result<{ version: number; updatedAt: string }>>;
  findByOwnerAndLocalId(
    ownerId: string,
    localId: number,
  ): Promise<Result<PublishedParty>>;
  /** Opens or closes the guest-facing invite link without touching the party. */
  setInvitesOpen(id: string, open: boolean): Promise<Result<PublishedParty>>;

  /** Removes the party outright; members and invites cascade with it. */
  deleteById(id: string): Promise<Result<void>>;

  /** Unpublishing deletes the row; its invites cascade with it. */
  unpublish(ownerId: string, id: string): Promise<Result<void>>;
}
