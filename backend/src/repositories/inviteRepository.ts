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
  /** The five characters on this guest's ticket. Unique within the party. */
  ticketCode: string;
  /** 'link' if they RSVPed themselves, 'manual' if an organiser typed them in. */
  source: InviteSource;
  checkedIn: boolean;
  checkedInAt: string | null;
  openedAt: string;
  answeredAt: string | null;
}

/** Where an invite came from. Only 'link' counts towards "reached". */
export type InviteSource = 'link' | 'manual';

/** An invite plus the referrer's display name, which the host's funnel shows. */
export interface InviteWithReferrer extends Invite {
  referrerName: string | null;
}

export const INVITE_ERRORS = {
  NOT_FOUND: 'invite_not_found',
  /** The cap is reached; the caller may still decline, just not confirm. */
  PARTY_FULL: 'party_full',
  /** The drawn ticket code was taken. Caller redraws — see lib/ticketCodes.ts. */
  CODE_TAKEN: 'ticket_code_taken',
  /** Five redraws all collided, which is a fault rather than bad luck. */
  CODE_UNAVAILABLE: 'ticket_code_unavailable',
  /** Someone already walked in on this ticket. */
  ALREADY_CHECKED_IN: 'already_checked_in',
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

  /**
   * A guest an organiser typed in, rather than one who RSVPed.
   *
   * On a shared party this has to be a server row like any other: it is what
   * lets the co-organiser see them and the second phone on the door check their
   * ticket. They arrive already confirmed — the organiser would not be typing
   * them in otherwise — and at depth 0, since they came through nobody.
   */
  addManual(args: {
    partyId: string;
    name: string;
    ticketCode: string;
  }): Promise<Result<Invite>>;

  /**
   * Marks a guest as through the door.
   *
   * The server arbitrates rather than each phone deciding for itself: that is
   * the whole difference between one scanner and several. A second scan returns
   * ALREADY_CHECKED_IN along with the invite, so the door can say *when* they
   * came in rather than only that they did.
   */
  checkIn(args: {
    inviteId: string;
    partyId: string;
    at: string;
  }): Promise<Result<Invite>>;

  /** Undoes a check-in, for the guest who was waved through by mistake. */
  undoCheckIn(args: {
    inviteId: string;
    partyId: string;
  }): Promise<Result<Invite>>;
}
