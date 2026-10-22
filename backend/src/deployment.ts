import { resolveTier, type Tier } from '../../shared/tiers';
import type { Bindings } from './appEnv';
import type { Repositories } from './repositories/repositories';

/**
 * What kind of Worker this is, read from its bindings in one place.
 *
 * Every answer here comes from a binding, never from a request: no caller can
 * talk their way into a self-hosted Worker's free `pro`, or into the sign-in
 * that skips Google.
 */
export interface Deployment {
  /** Somebody's own Worker rather than the hosted one (ADR 0001). */
  selfHosted: boolean;
  /**
   * Whether `/auth/dev` signs people in without Google: locally, and on a
   * self-hosted Worker, which is single-tenant by definition. `/api/session`
   * reads the same answer, so the app offers the email sign-in exactly where
   * the route would accept it.
   */
  devSignIn: boolean;
  /** Whether a guest can be offered "Continue with Google" at all (#22). */
  guestGoogle: boolean;
}

export function deployment(
  env: Pick<
    Partial<Bindings>,
    'SELF_HOSTED' | 'ENVIRONMENT' | 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET'
  >,
): Deployment {
  const selfHosted = env.SELF_HOSTED === 'true';
  return {
    selfHosted,
    devSignIn: selfHosted || env.ENVIRONMENT === 'local',
    guestGoogle:
      !!env.GOOGLE_CLIENT_ID?.trim() && !!env.GOOGLE_CLIENT_SECRET?.trim(),
  };
}

/** A stored tier as this deployment honours it (see `resolveTier`). */
export function effectiveTier(
  storedTier: Tier | null,
  env: Pick<Partial<Bindings>, 'SELF_HOSTED'>,
): Tier {
  return resolveTier({ storedTier, selfHosted: deployment(env).selfHosted });
}

/**
 * A user's tier, from their row on every request rather than from the JWT: a
 * session lives seven days, and a claim baked into one would keep granting
 * `pro` for a week after a refund. A user that cannot be found reads as free,
 * the tier that claims the least.
 */
export async function tierFor(
  repositories: Repositories,
  env: Pick<Partial<Bindings>, 'SELF_HOSTED'>,
  userId: string,
): Promise<Tier> {
  const found = await repositories.users.findById(userId);
  return effectiveTier(found.ok ? found.value.tier : null, env);
}
