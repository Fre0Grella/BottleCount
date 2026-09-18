import type { PartyRole } from '../../../../shared/collab';
import {
  MEMBER_ERRORS,
  type CollaboratorInvite,
  type MemberRepository,
  type PartyMember,
} from '../../repositories/memberRepository';
import { err, ok, type Result } from '../../repositories/result';
import type { User } from '../../repositories/userRepository';

/**
 * In-memory membership.
 *
 * It shares its map with the fake party repository, because `listForUser` has
 * to answer from the same membership that `roleFor` enforces — two copies would
 * let a test pass with a party visible in the list that its own guard refuses.
 */
export function fakeMembers(
  memberships: Map<string, Map<string, PartyRole>>,
  users: () => Map<string, User>,
): MemberRepository & { invites: Map<string, CollaboratorInvite> } {
  const invites = new Map<string, CollaboratorInvite>();
  let counter = 0;

  function toMember(
    partyId: string,
    userId: string,
    role: PartyRole,
  ): PartyMember {
    const user = users().get(userId);
    return {
      partyId,
      userId,
      email: user?.email ?? `${userId}@example.com`,
      name: user?.name ?? null,
      picture: user?.picture ?? null,
      role,
      addedAt: '2026-01-01T00:00:00.000Z',
    };
  }

  return {
    invites,

    async roleFor(partyId: string, userId: string): Promise<Result<PartyRole>> {
      const role = memberships.get(partyId)?.get(userId);
      return role ? ok(role) : err(MEMBER_ERRORS.NOT_A_MEMBER);
    },

    async listMembers(partyId: string): Promise<Result<PartyMember[]>> {
      const rows = memberships.get(partyId);
      if (!rows) return ok([]);
      const members = [...rows.entries()].map(([userId, role]) =>
        toMember(partyId, userId, role),
      );
      members.sort(
        (a, b) => Number(b.role === 'owner') - Number(a.role === 'owner'),
      );
      return ok(members);
    },

    async add({
      partyId,
      userId,
      role,
    }: {
      partyId: string;
      userId: string;
      role: PartyRole;
    }): Promise<Result<PartyMember>> {
      const rows = memberships.get(partyId) ?? new Map<string, PartyRole>();
      // Never demote: an owner opening their own invite link stays the owner.
      if (!rows.has(userId)) rows.set(userId, role);
      memberships.set(partyId, rows);
      return ok(toMember(partyId, userId, rows.get(userId)!));
    },

    async remove(partyId: string, userId: string): Promise<Result<void>> {
      const rows = memberships.get(partyId);
      const role = rows?.get(userId);
      if (!rows || !role) return err(MEMBER_ERRORS.NOT_FOUND);
      if (role === 'owner') return err(MEMBER_ERRORS.CANNOT_REMOVE_OWNER);
      rows.delete(userId);
      return ok(undefined);
    },

    async createInvite({
      partyId,
      createdBy,
    }: {
      partyId: string;
      createdBy: string;
    }): Promise<Result<CollaboratorInvite>> {
      const invite: CollaboratorInvite = {
        token: `collab-${++counter}`,
        partyId,
        createdBy,
        createdAt: new Date().toISOString(),
        revokedAt: null,
      };
      invites.set(invite.token, invite);
      return ok(invite);
    },

    async findInvite(token: string): Promise<Result<CollaboratorInvite>> {
      const invite = invites.get(token);
      if (!invite) return err(MEMBER_ERRORS.INVITE_UNKNOWN);
      if (invite.revokedAt !== null) return err(MEMBER_ERRORS.INVITE_REVOKED);
      return ok(invite);
    },

    async revokeInvitesFor(partyId: string): Promise<Result<void>> {
      for (const [token, invite] of invites) {
        if (invite.partyId === partyId && invite.revokedAt === null) {
          invites.set(token, {
            ...invite,
            revokedAt: new Date().toISOString(),
          });
        }
      }
      return ok(undefined);
    },
  };
}
