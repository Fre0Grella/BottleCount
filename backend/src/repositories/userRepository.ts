import type { Tier } from '../../../shared/tiers';
import type { Result } from './result';

export interface User {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  tier: Tier;
  createdAt: string;
  updatedAt: string;
}

/** Identity-provider account details handed over by a completed sign-in. */
export interface ProviderIdentity {
  provider: 'google' | 'dev';
  providerUserId: string;
  email: string;
  name?: string | null;
  picture?: string | null;
}

export const USER_ERRORS = {
  NOT_FOUND: 'user_not_found',
  EMAIL_TAKEN: 'email_taken',
} as const;

export interface UserRepository {
  findById(id: string): Promise<Result<User>>;
  /**
   * Resolves the provider account to a user, creating one the first time.
   * `isNew` is what tells the frontend to run its onboarding, so it reports the
   * user's creation, not the identity's.
   */
  upsertByIdentity(
    identity: ProviderIdentity,
  ): Promise<Result<{ user: User; isNew: boolean }>>;
  setTier(id: string, tier: Tier): Promise<Result<User>>;
}
