import { isPartyRole, type PartyRole } from '../../../../shared/collab';
import { newToken } from '../../lib/tokens';
import {
  MEMBER_ERRORS,
  type CollaboratorInvite,
  type MemberRepository,
  type PartyMember,
} from '../memberRepository';
import { err, ok, type Result } from '../result';

interface MemberRow {
  party_id: string;
  user_id: string;
  email: string;
  name: string | null;
  picture: string | null;
  role: string;
  added_at: string;
}

interface InviteRow {
  token: string;
  party_id: string;
  created_by: string;
  created_at: string;
  revoked_at: string | null;
}

function toMember(row: MemberRow): PartyMember {
  return {
    partyId: row.party_id,
    userId: row.user_id,
    email: row.email,
    name: row.name,
    picture: row.picture,
    // Narrow rather than cast: an unreadable role must fall to the one that
    // grants least, never to owner.
    role: isPartyRole(row.role) ? row.role : 'editor',
    addedAt: row.added_at,
  };
}

function toInvite(row: InviteRow): CollaboratorInvite {
  return {
    token: row.token,
    partyId: row.party_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}

export class MemberRepositoryD1 implements MemberRepository {
  constructor(private readonly db: D1Database) {}

  async roleFor(partyId: string, userId: string): Promise<Result<PartyRole>> {
    const row = await this.db
      .prepare(
        'SELECT role FROM party_members WHERE party_id = ? AND user_id = ?',
      )
      .bind(partyId, userId)
      .first<{ role: string }>();

    if (!row) return err(MEMBER_ERRORS.NOT_A_MEMBER);
    return ok(isPartyRole(row.role) ? row.role : 'editor');
  }

  async listMembers(partyId: string): Promise<Result<PartyMember[]>> {
    // Owner first, then by when they joined, so the list reads as the party
    // grew rather than in whatever order SQLite feels like.
    const { results } = await this.db
      .prepare(
        `SELECT m.party_id, m.user_id, m.role, m.added_at,
                u.email, u.name, u.picture
         FROM party_members m
         JOIN users u ON u.id = m.user_id
         WHERE m.party_id = ?
         ORDER BY (m.role = 'owner') DESC, m.added_at ASC`,
      )
      .bind(partyId)
      .all<MemberRow>();

    return ok(results.map(toMember));
  }

  async add({
    partyId,
    userId,
    role,
  }: {
    partyId: string;
    userId: string;
    role: PartyRole;
  }): Promise<Result<PartyMember>> {
    // DO NOTHING rather than DO UPDATE: accepting an invite twice must not
    // demote an owner who happened to open their own link.
    await this.db
      .prepare(
        `INSERT INTO party_members (party_id, user_id, role, added_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (party_id, user_id) DO NOTHING`,
      )
      .bind(partyId, userId, role, new Date().toISOString())
      .run();

    const row = await this.db
      .prepare(
        `SELECT m.party_id, m.user_id, m.role, m.added_at,
                u.email, u.name, u.picture
         FROM party_members m
         JOIN users u ON u.id = m.user_id
         WHERE m.party_id = ? AND m.user_id = ?`,
      )
      .bind(partyId, userId)
      .first<MemberRow>();

    return row ? ok(toMember(row)) : err(MEMBER_ERRORS.NOT_FOUND);
  }

  async remove(partyId: string, userId: string): Promise<Result<void>> {
    // The owner guard is in the WHERE clause so there is no window between
    // checking the role and deleting the row.
    const result = await this.db
      .prepare(
        `DELETE FROM party_members
         WHERE party_id = ? AND user_id = ? AND role <> 'owner'`,
      )
      .bind(partyId, userId)
      .run();

    if (result.meta.changes > 0) return ok(undefined);

    const existing = await this.roleFor(partyId, userId);
    if (!existing.ok) return err(MEMBER_ERRORS.NOT_FOUND);
    return err(MEMBER_ERRORS.CANNOT_REMOVE_OWNER);
  }

  async createInvite({
    partyId,
    createdBy,
  }: {
    partyId: string;
    createdBy: string;
  }): Promise<Result<CollaboratorInvite>> {
    const row = await this.db
      .prepare(
        `INSERT INTO collaborator_invites (token, party_id, created_by, created_at)
         VALUES (?, ?, ?, ?) RETURNING *`,
      )
      .bind(newToken(), partyId, createdBy, new Date().toISOString())
      .first<InviteRow>();

    return row ? ok(toInvite(row)) : err(MEMBER_ERRORS.INVITE_UNKNOWN);
  }

  async findInvite(token: string): Promise<Result<CollaboratorInvite>> {
    const row = await this.db
      .prepare('SELECT * FROM collaborator_invites WHERE token = ?')
      .bind(token)
      .first<InviteRow>();

    if (!row) return err(MEMBER_ERRORS.INVITE_UNKNOWN);
    if (row.revoked_at !== null) return err(MEMBER_ERRORS.INVITE_REVOKED);
    return ok(toInvite(row));
  }

  async revokeInvitesFor(partyId: string): Promise<Result<void>> {
    await this.db
      .prepare(
        `UPDATE collaborator_invites SET revoked_at = ?
         WHERE party_id = ? AND revoked_at IS NULL`,
      )
      .bind(new Date().toISOString(), partyId)
      .run();
    return ok(undefined);
  }
}
