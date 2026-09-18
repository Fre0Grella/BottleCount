import { d1Repositories } from './repositories/d1';
import type { Repositories } from './repositories/repositories';

/**
 * Picks the storage target for a request.
 *
 * D1 is the only one today. It stays a function rather than a module-level
 * constant because a Worker's bindings arrive per request, not at import time —
 * and because the seam is where a self-hoster who would rather run Postgres
 * plugs in, the way FantasyWiki keeps a MongoDB target beside its D1 one.
 */
export function repositoriesFor(env: { db: D1Database }): Repositories {
  return d1Repositories(env.db);
}
