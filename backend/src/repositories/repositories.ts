import type { InviteRepository } from './inviteRepository';
import type { LicenceRepository } from './licenceRepository';
import type { PartyRepository } from './partyRepository';
import type { UserRepository } from './userRepository';

/** Everything a route can reach storage through. */
export interface Repositories {
  users: UserRepository;
  licences: LicenceRepository;
  parties: PartyRepository;
  invites: InviteRepository;
}
