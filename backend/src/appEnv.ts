import type { Repositories } from './repositories/repositories';

/** Everything the `*`-middleware puts on the context for routes to read. */
export interface AppVariables {
  repositories: Repositories;
}
