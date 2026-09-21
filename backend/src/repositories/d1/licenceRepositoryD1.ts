import { isTier } from '../../../../shared/tiers';
import { err, ok, type Result } from '../result';
import {
  LICENCE_ERRORS,
  type LicenceKey,
  type LicenceRepository,
} from '../licenceRepository';

interface LicenceRow {
  code: string;
  tier: string;
  issued_at: string;
  redeemed_at: string | null;
  redeemed_by: string | null;
  note: string | null;
}

function toLicence(row: LicenceRow): LicenceKey {
  return {
    code: row.code,
    tier: isTier(row.tier) ? row.tier : 'free',
    issuedAt: row.issued_at,
    redeemedAt: row.redeemed_at,
    redeemedBy: row.redeemed_by,
    note: row.note,
  };
}

/** Codes are handed out uppercased and hyphenated; users retype them however. */
function normalise(code: string): string {
  return code.trim().toUpperCase();
}

export class LicenceRepositoryD1 implements LicenceRepository {
  constructor(private readonly db: D1Database) {}

  async redeem(code: string, userId: string): Promise<Result<LicenceKey>> {
    const normalised = normalise(code);

    // One statement, so two requests racing the same code cannot both win: the
    // loser's UPDATE matches no row because `redeemed_at` is no longer NULL.
    const claimed = await this.db
      .prepare(
        `UPDATE licence_keys SET redeemed_at = ?, redeemed_by = ?
         WHERE code = ? AND redeemed_at IS NULL RETURNING *`,
      )
      .bind(new Date().toISOString(), userId, normalised)
      .first<LicenceRow>();

    if (claimed) return ok(toLicence(claimed));

    // Nothing was claimed: either the code does not exist, someone else holds
    // it, or this same user already redeemed it.
    const existing = await this.db
      .prepare('SELECT * FROM licence_keys WHERE code = ?')
      .bind(normalised)
      .first<LicenceRow>();

    if (!existing) return err(LICENCE_ERRORS.UNKNOWN);
    // Idempotent for the holder — a double-tapped Redeem button is not an error
    // the user can act on, and their tier is already what the code grants.
    if (existing.redeemed_by === userId) return ok(toLicence(existing));
    return err(LICENCE_ERRORS.ALREADY_REDEEMED);
  }
}
