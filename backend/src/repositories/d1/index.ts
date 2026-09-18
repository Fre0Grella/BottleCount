import type { Repositories } from '../repositories';
import { LicenceRepositoryD1 } from './licenceRepositoryD1';
import { UserRepositoryD1 } from './userRepositoryD1';

export function d1Repositories(db: D1Database): Repositories {
  return {
    users: new UserRepositoryD1(db),
    licences: new LicenceRepositoryD1(db),
  };
}
