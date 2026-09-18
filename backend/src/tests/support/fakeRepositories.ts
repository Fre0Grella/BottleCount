import type { Tier } from '../../../../shared/tiers';
import type {
  LicenceKey,
  LicenceRepository,
} from '../../repositories/licenceRepository';
import { LICENCE_ERRORS } from '../../repositories/licenceRepository';
import type { Repositories } from '../../repositories/repositories';
import { err, ok, type Result } from '../../repositories/result';
import type {
  ProviderIdentity,
  User,
  UserRepository,
} from '../../repositories/userRepository';
import { USER_ERRORS } from '../../repositories/userRepository';

/**
 * In-memory stand-ins, so a route test says what it is about — a tier, a
 * cookie, a guard — instead of setting up a database to say it.
 *
 * They implement the same interfaces the D1 classes do, which is the point of
 * those interfaces existing: what these cannot catch is a mistake in the SQL,
 * and nothing else.
 */
export function fakeUsers(seed: User[] = []): UserRepository & {
  rows: Map<string, User>;
} {
  const rows = new Map(seed.map((u) => [u.id, u]));

  return {
    rows,
    async findById(id: string): Promise<Result<User>> {
      const found = rows.get(id);
      return found ? ok(found) : err(USER_ERRORS.NOT_FOUND);
    },
    async upsertByIdentity(
      identity: ProviderIdentity,
    ): Promise<Result<{ user: User; isNew: boolean }>> {
      for (const user of rows.values()) {
        if (user.email === identity.email) return ok({ user, isNew: false });
      }
      const now = new Date().toISOString();
      const user: User = {
        id: `user-${rows.size + 1}`,
        email: identity.email,
        name: identity.name ?? null,
        picture: identity.picture ?? null,
        tier: 'free',
        createdAt: now,
        updatedAt: now,
      };
      rows.set(user.id, user);
      return ok({ user, isNew: true });
    },
    async setTier(id: string, tier: Tier): Promise<Result<User>> {
      const found = rows.get(id);
      if (!found) return err(USER_ERRORS.NOT_FOUND);
      const updated = { ...found, tier, updatedAt: new Date().toISOString() };
      rows.set(id, updated);
      return ok(updated);
    },
  };
}

export function fakeLicences(seed: LicenceKey[] = []): LicenceRepository {
  const rows = new Map(seed.map((l) => [l.code, l]));

  return {
    async redeem(code: string, userId: string): Promise<Result<LicenceKey>> {
      const found = rows.get(code.trim().toUpperCase());
      if (!found) return err(LICENCE_ERRORS.UNKNOWN);
      if (found.redeemedBy === userId) return ok(found);
      if (found.redeemedAt !== null)
        return err(LICENCE_ERRORS.ALREADY_REDEEMED);
      const claimed: LicenceKey = {
        ...found,
        redeemedAt: new Date().toISOString(),
        redeemedBy: userId,
      };
      rows.set(claimed.code, claimed);
      return ok(claimed);
    },
  };
}

export function fakeRepositories(
  users = fakeUsers(),
  licences = fakeLicences(),
): Repositories {
  return { users, licences };
}

export function aUser(overrides: Partial<User> = {}): User {
  const now = '2026-01-01T00:00:00.000Z';
  return {
    id: 'user-1',
    email: 'host@example.com',
    name: 'Host',
    picture: null,
    tier: 'free',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function aLicence(overrides: Partial<LicenceKey> = {}): LicenceKey {
  return {
    code: 'BC-TEST-0001',
    tier: 'pro',
    issuedAt: '2026-01-01T00:00:00.000Z',
    redeemedAt: null,
    redeemedBy: null,
    note: null,
    ...overrides,
  };
}
