import type { JwtVariables } from 'hono/jwt';
import type { Repositories } from './repositories/repositories';

/** A Workers rate-limiting binding. */
export interface RateLimiter {
  limit(o: { key: string }): Promise<{ success: boolean }>;
}

/** Everything the Worker is bound to. Routes read it through `c.env`. */
export type Bindings = {
  db: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  JWT_SECRET: string;
  FRONTEND_URL: string;
  ENVIRONMENT: string;
  /** "true" on a self-hosted deployment — read it through `deployment()`. */
  SELF_HOSTED?: string;
  /** A reusable licence for testing. Ignored on production — see routes/licences.ts. */
  TEST_LICENCE_CODE?: string;
  /**
   * Guards the unauthenticated invite endpoints. Optional: the local
   * environment leaves it unbound so a fresh clone runs without a Cloudflare
   * account, and absent means unlimited, which is right for a machine only you
   * can reach.
   */
  INVITE_RATE_LIMITER?: RateLimiter;
  /** Guards the short ticket links, generously — see routes/tickets.ts. */
  TICKET_RATE_LIMITER?: RateLimiter;
  /**
   * Party cover photos (ADR 0007). Optional: a Worker without a bucket bound
   * simply does not offer them. Read through `deployment()` and
   * `lib/coverPhotos.ts`.
   */
  COVER_PHOTOS?: R2Bucket;
};

/** Everything the `*`-middleware puts on the context for routes to read. */
export interface AppVariables {
  repositories: Repositories;
  /**
   * The authenticated user's id, set by a route group's own guard after it has
   * resolved and checked the row — not by the JWT middleware, which only proves
   * the cookie is signed.
   */
  userId?: string;
}

export type AppEnv = { Bindings: Bindings; Variables: AppVariables };

/** A route group behind `requireUser`: the caller's id is always there. */
export type UserEnv = {
  Bindings: Bindings;
  Variables: AppVariables & JwtVariables & { userId: string };
};
