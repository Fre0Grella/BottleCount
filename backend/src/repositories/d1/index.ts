import type { Repositories } from '../repositories';
import { InviteRepositoryD1 } from './inviteRepositoryD1';
import { LicenceRepositoryD1 } from './licenceRepositoryD1';
import { PartyRepositoryD1 } from './partyRepositoryD1';
import { UserRepositoryD1 } from './userRepositoryD1';

export function d1Repositories(db: D1Database): Repositories {
  return {
    users: new UserRepositoryD1(db),
    licences: new LicenceRepositoryD1(db),
    parties: new PartyRepositoryD1(db),
    invites: new InviteRepositoryD1(db),
  };
}
