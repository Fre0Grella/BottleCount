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
}

export const PARTY_ERRORS = {
  NOT_FOUND: 'party_not_found',
  NOT_OWNER: 'party_not_owner',
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
  findByOwnerAndLocalId(
    ownerId: string,
    localId: number,
  ): Promise<Result<PublishedParty>>;
  /** Unpublishing deletes the row; its invites cascade with it. */
  unpublish(ownerId: string, id: string): Promise<Result<void>>;
}
