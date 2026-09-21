import type { PartyRole } from '../../../shared/collab';
import type { Result } from './result';

export interface PartyMember {
  partyId: string;
  userId: string;
  email: string;
  name: string | null;
  picture: string | null;
  role: PartyRole;
  addedAt: string;
}

export interface CollaboratorInvite {
  token: string;
  partyId: string;
  createdBy: string;
  createdAt: string;
  revokedAt: string | null;
}

export const MEMBER_ERRORS = {
  NOT_A_MEMBER: 'not_a_member',
  NOT_FOUND: 'member_not_found',
  /** The owner's own membership is not removable — see `remove`. */
  CANNOT_REMOVE_OWNER: 'cannot_remove_owner',
  INVITE_UNKNOWN: 'collaborator_invite_unknown',
  INVITE_REVOKED: 'collaborator_invite_revoked',
} as const;

export interface MemberRepository {
  /** The caller's role on a party, or `NOT_A_MEMBER`. The authorisation check. */
  roleFor(partyId: string, userId: string): Promise<Result<PartyRole>>;

  listMembers(partyId: string): Promise<Result<PartyMember[]>>;

  /** Adding someone who is already on the party keeps the role they have. */
  add(args: {
    partyId: string;
    userId: string;
    role: PartyRole;
  }): Promise<Result<PartyMember>>;

  /**
   * Removes a member. Refuses the owner: a party with no owner has nobody who
   * can delete it or manage its people, and the row is what several queries
   * key on.
   */
  remove(partyId: string, userId: string): Promise<Result<void>>;

  createInvite(args: {
    partyId: string;
    createdBy: string;
  }): Promise<Result<CollaboratorInvite>>;

  findInvite(token: string): Promise<Result<CollaboratorInvite>>;

  revokeInvitesFor(partyId: string): Promise<Result<void>>;
}
