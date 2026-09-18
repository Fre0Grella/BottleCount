import type { LicenceRepository } from './licenceRepository';
import type { UserRepository } from './userRepository';

/** Everything a route can reach storage through. */
export interface Repositories {
  users: UserRepository;
  licences: LicenceRepository;
}
