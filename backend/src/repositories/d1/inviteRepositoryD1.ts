import type { InviteAnswer, InviteStatus } from '../../../../shared/invites';
import { INVITE_STATUSES } from '../../../../shared/invites';
import { newToken } from '../../lib/tokens';
import {
  INVITE_ERRORS,
  type Invite,
  type InviteRepository,
  type InviteWithReferrer,
} from '../inviteRepository';
import { err, ok, type Result } from '../result';

interface InviteRow {
  id: string;
  party_id: string;
  name: string | null;
  status: string;
  depth: number;
  referrer_id: string | null;
  forward_token: string;
  checked_in: number;
  checked_in_at: string | null;
  opened_at: string;
  answered_at: string | null;
}

interface InviteJoinRow extends InviteRow {
  referrer_name: string | null;
}

function toStatus(value: string): InviteStatus {
  // The column has a CHECK constraint but is still TEXT. Narrow rather than
  // cast, and fall back to the state that claims the least.
  return (INVITE_STATUSES as readonly string[]).includes(value)
    ? (value as InviteStatus)
    : 'opened';
}

function toInvite(row: InviteRow): Invite {
  return {
    id: row.id,
    partyId: row.party_id,
    name: row.name,
    status: toStatus(row.status),
    depth: row.depth,
    referrerId: row.referrer_id,
    forwardToken: row.forward_token,
    checkedIn: row.checked_in === 1,
    checkedInAt: row.checked_in_at,
    openedAt: row.opened_at,
    answeredAt: row.answered_at,
  };
}

export class InviteRepositoryD1 implements InviteRepository {
  constructor(private readonly db: D1Database) {}

  async open({
    partyId,
    referrerToken,
    rootToken,
    existingInviteId,
  }: {
    partyId: string;
    referrerToken: string | null;
    rootToken: string;
    existingInviteId: string | null;
  }): Promise<Result<Invite>> {
    // A browser that already has a row for this party is the same guest coming
    // back — show them their answer rather than counting them twice. Scoped to
    // the party so an id lifted from another party's link resolves to nothing.
    if (existingInviteId) {
      const existing = await this.db
        .prepare('SELECT * FROM invites WHERE id = ? AND party_id = ?')
        .bind(existingInviteId, partyId)
        .first<InviteRow>();
      if (existing) return ok(toInvite(existing));
    }

    let depth = 0;
    let referrerId: string | null = null;

    // The host's own token is depth 0 and has no invite row behind it. Any
    // other token has to resolve to an invite *of this party*; one that does
    // not is treated as no referrer at all rather than rejected, because the
    // common cause is a link from a party that has since been unpublished and
    // the guest should still be able to RSVP.
    if (referrerToken && referrerToken !== rootToken) {
      const referrer = await this.db
        .prepare(
          'SELECT id, depth FROM invites WHERE forward_token = ? AND party_id = ?',
        )
        .bind(referrerToken, partyId)
        .first<{ id: string; depth: number }>();
      if (referrer) {
        referrerId = referrer.id;
        depth = referrer.depth + 1;
      }
    }

    const row = await this.db
      .prepare(
        `INSERT INTO invites (
           id, party_id, name, status, depth, referrer_id, forward_token, opened_at
         ) VALUES (?, ?, NULL, 'opened', ?, ?, ?, ?) RETURNING *`,
      )
      .bind(
        crypto.randomUUID(),
        partyId,
        depth,
        referrerId,
        newToken(),
        new Date().toISOString(),
      )
      .first<InviteRow>();

    return row ? ok(toInvite(row)) : err(INVITE_ERRORS.NOT_FOUND);
  }

  async findById(id: string): Promise<Result<Invite>> {
    const row = await this.db
      .prepare('SELECT * FROM invites WHERE id = ?')
      .bind(id)
      .first<InviteRow>();
    return row ? ok(toInvite(row)) : err(INVITE_ERRORS.NOT_FOUND);
  }

  async answer({
    inviteId,
    partyId,
    name,
    answer,
    maxCapacity,
  }: {
    inviteId: string;
    partyId: string;
    name: string;
    answer: InviteAnswer;
    maxCapacity: number | null;
  }): Promise<Result<Invite>> {
    const now = new Date().toISOString();

    // Declining is always allowed — a full party is still a party you can say
    // no to, and refusing the decline would leave the row stuck at `opened`.
    if (answer === 'declined' || maxCapacity === null) {
      const row = await this.db
        .prepare(
          `UPDATE invites SET name = ?, status = ?, answered_at = ?
           WHERE id = ? AND party_id = ? RETURNING *`,
        )
        .bind(name, answer, now, inviteId, partyId)
        .first<InviteRow>();
      return row ? ok(toInvite(row)) : err(INVITE_ERRORS.NOT_FOUND);
    }

    // Capacity check and write in one statement. Counting first and updating
    // after would let two guests racing for the last place both read "one left"
    // and both confirm.
    //
    // The subquery excludes this invite, so a guest who is already confirmed and
    // merely corrects their name does not have to fit into a party they are
    // already counted in.
    const row = await this.db
      .prepare(
        `UPDATE invites SET name = ?, status = 'confirmed', answered_at = ?
         WHERE id = ? AND party_id = ?
           AND (
             SELECT COUNT(*) FROM invites others
             WHERE others.party_id = ?
               AND others.status = 'confirmed'
               AND others.id <> ?
           ) < ?
         RETURNING *`,
      )
      .bind(name, now, inviteId, partyId, partyId, inviteId, maxCapacity)
      .first<InviteRow>();

    if (row) return ok(toInvite(row));

    // Nothing was written: either the invite is gone, or the party is full.
    const stillThere = await this.db
      .prepare('SELECT id FROM invites WHERE id = ? AND party_id = ?')
      .bind(inviteId, partyId)
      .first<{ id: string }>();

    return err(stillThere ? INVITE_ERRORS.PARTY_FULL : INVITE_ERRORS.NOT_FOUND);
  }

  async setStatus({
    inviteId,
    partyId,
    status,
  }: {
    inviteId: string;
    partyId: string;
    status: InviteStatus;
  }): Promise<Result<Invite>> {
    // Sending someone back to `opened` clears the answer timestamp too, so the
    // funnel does not show a guest who supposedly answered at a time but holds
    // no answer.
    const row = await this.db
      .prepare(
        `UPDATE invites
         SET status = ?, answered_at = CASE WHEN ? = 'opened' THEN NULL ELSE ? END
         WHERE id = ? AND party_id = ? RETURNING *`,
      )
      .bind(status, status, new Date().toISOString(), inviteId, partyId)
      .first<InviteRow>();

    return row ? ok(toInvite(row)) : err(INVITE_ERRORS.NOT_FOUND);
  }

  async listForParty(partyId: string): Promise<Result<InviteWithReferrer[]>> {
    // Oldest first: the host's client matches these onto rows it already has by
    // id, and a stable order keeps newly opened invites appending at the end
    // rather than reshuffling the list under the reader.
    const { results } = await this.db
      .prepare(
        `SELECT i.*, r.name AS referrer_name
         FROM invites i
         LEFT JOIN invites r ON r.id = i.referrer_id
         WHERE i.party_id = ?
         ORDER BY i.opened_at ASC, i.id ASC`,
      )
      .bind(partyId)
      .all<InviteJoinRow>();

    return ok(
      results.map((row) => ({
        ...toInvite(row),
        referrerName: row.referrer_name,
      })),
    );
  }

  async countConfirmed(partyId: string): Promise<Result<number>> {
    const row = await this.db
      .prepare(
        "SELECT COUNT(*) AS n FROM invites WHERE party_id = ? AND status = 'confirmed'",
      )
      .bind(partyId)
      .first<{ n: number }>();
    return ok(row?.n ?? 0);
  }
}
