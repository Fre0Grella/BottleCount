import { vi } from 'vitest';
import { fakeInvites, fakeParties, resetFakeIds } from '../support/fakeInvites';
import {
  fakeLicences,
  fakeRepositories,
  fakeUsers,
} from '../support/fakeRepositories';
import { repositoryContract } from './repositories.contract';

/** Codes the next draws return before falling back to real ones. */
const forced: string[] = [];

vi.mock('../../../../shared/tickets', async (importOriginal) => {
  const real =
    await importOriginal<typeof import('../../../../shared/tickets')>();
  return {
    ...real,
    generateTicketCode: () => forced.shift() ?? real.generateTicketCode(),
  };
});

repositoryContract('in-memory fakes', {
  make({ licences }) {
    resetFakeIds();
    forced.length = 0;
    return fakeRepositories(
      fakeUsers(),
      fakeLicences(licences),
      fakeParties(),
      fakeInvites(),
    );
  },
  forceTicketCodes(codes) {
    forced.push(...codes);
  },
});
