import type { PhotoSlot } from '../../../shared/coverPhotos';
import type { Result } from './result';

/** One of a party's photos as the ledger records it (migration 0008). */
export interface StoredCoverPhoto {
  partyId: string;
  slot: PhotoSlot;
  token: string;
  bytes: number;
}

/** What an R2 operation is billed as: Class A (writes) or Class B (reads). */
export type R2Spend = 'write' | 'read';

/**
 * The ledger that keeps R2 inside its free tier (ADR 0007): which photo each
 * party has in each slot and how big it is, and how many operations each day
 * has spent.
 */
export interface CoverPhotoRepository {
  /** The party's photo in `slot`, or null when it has none. */
  find(
    partyId: string,
    slot: PhotoSlot,
  ): Promise<Result<StoredCoverPhoto | null>>;

  /** Every photo the party has, in any slot. */
  listForParty(partyId: string): Promise<Result<StoredCoverPhoto[]>>;

  /** Bytes stored across every party and slot. */
  totalBytes(): Promise<Result<number>>;

  /** Records the photo, replacing the one the party had in that slot. */
  save(photo: StoredCoverPhoto): Promise<Result<void>>;

  /** Forgets the party's photo in `slot`. Already gone is fine. */
  remove(partyId: string, slot: PhotoSlot): Promise<Result<void>>;

  /**
   * Takes one operation from `day`'s budget of `limit` for `kind`, and answers
   * whether there was one to take. Atomic: two requests racing for the last
   * one cannot both get it.
   */
  spend(kind: R2Spend, day: string, limit: number): Promise<Result<boolean>>;
}
