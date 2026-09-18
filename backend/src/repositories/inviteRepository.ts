import type { InviteAnswer, InviteStatus } from '../../../shared/invites';
import type { Result } from './result';

export interface Invite {
  id: string;
  partyId: string;
  name: string | null;
  status: InviteStatus;
  depth: number;
  referrerId: string | null;
  forwardToken: string;
  checkedIn: boolean;
  checkedInAt: string | null;
  openedAt: string;
  answeredAt: string | null;
}

/** An invite plus the referrer's display name, which the host's funnel shows. */
export interface InviteWithReferrer extends Invite {
  referrerName: string | null;
}

export const INVITE_ERRORS = {
  NOT_FOUND: 'invite_not_found',
  /** The cap is reached; the caller may still decline, just not confirm. */
  PARTY_FULL: 'party_full',
} as const;

export interface InviteRepository {
  /**
   * Records that someone opened the link, at `referrerToken`'s depth + 1 (or 0
   * for the host's own token). Returns the existing row when the caller already
   * has one, so a reload or a second visit is the same guest, not a second one.
   */
  open(args: {
    partyId: string;
    referrerToken: string | null;
    rootToken: string;
    existingInviteId: string | null;
  }): Promise<Result<Invite>>;

  findById(id: string): Promise<Result<Invite>>;

  /**
   * Records an answer. Confirming is refused once the party is full, and the
   * check has to be part of the write — two guests confirming the last place at
   * once must not both succeed.
   */
  answer(args: {
    inviteId: string;
    partyId: string;
    name: string;
    answer: InviteAnswer;
    maxCapacity: number | null;
  }): Promise<Result<Invite>>;

  /**
   * The host overriding a guest's state — "I spoke to her, she's coming".
   *
   * Unlike {@link answer} this ignores capacity: the host is the authority on
   * their own door, and a cap they set themselves should not stop them letting
   * one more person in.
   */
  setStatus(args: {
    inviteId: string;
    partyId: string;
    status: InviteStatus;
  }): Promise<Result<Invite>>;

  /** The host's funnel, oldest first so client-side ids stay stable. */
  listForParty(partyId: string): Promise<Result<InviteWithReferrer[]>>;

  countConfirmed(partyId: string): Promise<Result<number>>;
}
