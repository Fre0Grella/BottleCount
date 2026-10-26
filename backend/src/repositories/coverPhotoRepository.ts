import type { Result } from './result';

/** A party's photo as the ledger records it (migration 0007). */
export interface StoredCoverPhoto {
  partyId: string;
  token: string;
  bytes: number;
}

/** What an R2 operation is billed as: Class A (writes) or Class B (reads). */
export type R2Spend = 'write' | 'read';

/**
 * The ledger that keeps R2 inside its free tier (ADR 0007): which photo each
 * party has and how big it is, and how many operations each day has spent.
 */
export interface CoverPhotoRepository {
  /** The party's photo, or null when it has none. */
  find(partyId: string): Promise<Result<StoredCoverPhoto | null>>;

  /** Bytes stored across every party. */
  totalBytes(): Promise<Result<number>>;

  /** Records the party's photo, replacing the one it had. */
  save(photo: StoredCoverPhoto): Promise<Result<void>>;

  /** Forgets the party's photo. Already gone is fine. */
  remove(partyId: string): Promise<Result<void>>;

  /**
   * Takes one operation from `day`'s budget of `limit` for `kind`, and answers
   * whether there was one to take. Atomic: two requests racing for the last
   * one cannot both get it.
   */
  spend(kind: R2Spend, day: string, limit: number): Promise<Result<boolean>>;
}
