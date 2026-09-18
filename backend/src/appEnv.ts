import type { Repositories } from './repositories/repositories';

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
