import { isTier, type Tier } from '../../../../shared/tiers';
import { err, ok, type Result } from '../result';
import {
  USER_ERRORS,
  type ProviderIdentity,
  type User,
  type UserRepository,
} from '../userRepository';

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  tier: string;
  created_at: string;
  updated_at: string;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    picture: row.picture,
    // A row can only hold 'free' or 'pro' (CHECK constraint), but the column is
    // still TEXT, so narrow rather than cast: an unreadable value must downgrade
    // to the safe tier, never be trusted into `pro`.
    tier: isTier(row.tier) ? row.tier : 'free',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class UserRepositoryD1 implements UserRepository {
  constructor(private readonly db: D1Database) {}

  async findById(id: string): Promise<Result<User>> {
    const row = await this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first<UserRow>();
    return row ? ok(toUser(row)) : err(USER_ERRORS.NOT_FOUND);
  }

  async upsertByIdentity(
    identity: ProviderIdentity,
  ): Promise<Result<{ user: User; isNew: boolean }>> {
    const existing = await this.db
      .prepare(
        `SELECT u.* FROM users u
         JOIN identities i ON i.user_id = u.id
         WHERE i.provider = ? AND i.provider_user_id = ?`,
      )
      .bind(identity.provider, identity.providerUserId)
      .first<UserRow>();

    if (existing) {
      // Name and picture change on the provider's side; refreshing them here is
      // what keeps a renamed account from showing its old name forever.
      const updated = await this.db
        .prepare(
          `UPDATE users SET name = ?, picture = ?, updated_at = ?
           WHERE id = ? RETURNING *`,
        )
        .bind(
          identity.name ?? existing.name,
          identity.picture ?? existing.picture,
          new Date().toISOString(),
          existing.id,
        )
        .first<UserRow>();
      return ok({ user: toUser(updated ?? existing), isNew: false });
    }

    // Same person, second provider: attach the identity to the user the email
    // already names instead of minting a duplicate they cannot merge later.
    const byEmail = await this.db
      .prepare('SELECT * FROM users WHERE email = ?')
      .bind(identity.email)
      .first<UserRow>();

    const now = new Date().toISOString();

    if (byEmail) {
      await this.db
        .prepare(
          `INSERT INTO identities (provider, provider_user_id, user_id, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(identity.provider, identity.providerUserId, byEmail.id, now)
        .run();
      return ok({ user: toUser(byEmail), isNew: false });
    }

    const id = crypto.randomUUID();
    // D1 batches run in an implicit transaction, so a user is never left
    // without the identity that is the only way to reach it.
    const [inserted] = await this.db.batch<UserRow>([
      this.db
        .prepare(
          `INSERT INTO users (id, email, name, picture, tier, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'free', ?, ?) RETURNING *`,
        )
        .bind(
          id,
          identity.email,
          identity.name ?? null,
          identity.picture ?? null,
          now,
          now,
        ),
      this.db
        .prepare(
          `INSERT INTO identities (provider, provider_user_id, user_id, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .bind(identity.provider, identity.providerUserId, id, now),
    ]);

    const row = inserted?.results[0];
    return row
      ? ok({ user: toUser(row), isNew: true })
      : err(USER_ERRORS.EMAIL_TAKEN);
  }

  async setTier(id: string, tier: Tier): Promise<Result<User>> {
    const row = await this.db
      .prepare(
        'UPDATE users SET tier = ?, updated_at = ? WHERE id = ? RETURNING *',
      )
      .bind(tier, new Date().toISOString(), id)
      .first<UserRow>();
    return row ? ok(toUser(row)) : err(USER_ERRORS.NOT_FOUND);
  }
}
