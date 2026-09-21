import type { Tier } from '../../../shared/tiers';
import type { Result } from './result';

export interface LicenceKey {
  code: string;
  tier: Tier;
  issuedAt: string;
  redeemedAt: string | null;
  redeemedBy: string | null;
  note: string | null;
}

export const LICENCE_ERRORS = {
  /** No such code. Deliberately indistinguishable from a used one to callers. */
  UNKNOWN: 'licence_unknown',
  ALREADY_REDEEMED: 'licence_already_redeemed',
} as const;

export interface LicenceRepository {
  /**
   * Claims the code for `userId` and returns the tier it grants.
   *
   * Must be atomic: two requests racing the same code may not both succeed.
   * Redeeming a code the same user already redeemed succeeds idempotently, so a
   * double-tapped button does not read as an error.
   */
  redeem(code: string, userId: string): Promise<Result<LicenceKey>>;
}
