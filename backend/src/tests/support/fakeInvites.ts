import type {
  InviteAnswer,
  InviteStatus,
  PublishPartyRequest,
} from '../../../../shared/invites';
import type {
  Invite,
  InviteRepository,
  InviteWithReferrer,
} from '../../repositories/inviteRepository';
import { INVITE_ERRORS } from '../../repositories/inviteRepository';
import {
  PARTY_ERRORS,
  type PartyRepository,
  type PublishedParty,
} from '../../repositories/partyRepository';
import { err, ok, type Result } from '../../repositories/result';

/**
 * In-memory parties and invites.
 *
 * These reproduce the *rules* — depth from the referrer, one row per returning
 * browser, capacity refused on confirm but never on decline — because those are
 * what the route tests are about. They do not reproduce the atomicity the real
 * statements get from doing the check and the write together; a race is a
 * property of the SQL, and only the Workers pool can test it.
 */

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${++counter}`;

export function resetFakeIds(): void {
  counter = 0;
}

export function fakeParties(seed: PublishedParty[] = []): PartyRepository & {
  rows: Map<string, PublishedParty>;
} {
  const rows = new Map(seed.map((p) => [p.id, p]));

  return {
    rows,
    async publish(
      ownerId: string,
      snapshot: PublishPartyRequest,
    ): Promise<Result<PublishedParty>> {
      const now = new Date().toISOString();
      for (const row of rows.values()) {
        if (row.ownerId === ownerId && row.localId === snapshot.localId) {
          // Republishing keeps the slug and root token — links already sent
          // have to keep working.
          const updated: PublishedParty = {
            ...row,
            name: snapshot.name,
            date: snapshot.date,
            cover: snapshot.cover,
            venue: snapshot.venue,
            allowForward: snapshot.allowForward,
            maxCapacity: snapshot.maxCapacity,
            updatedAt: now,
          };
          rows.set(row.id, updated);
          return ok(updated);
        }
      }
      const party: PublishedParty = {
        id: nextId('party'),
        ownerId,
        localId: snapshot.localId,
        slug: `${snapshot.name.toLowerCase().replace(/\W+/g, '-')}-${nextId('s')}`,
        name: snapshot.name,
        date: snapshot.date,
        cover: snapshot.cover,
        venue: snapshot.venue,
        allowForward: snapshot.allowForward,
        maxCapacity: snapshot.maxCapacity,
        rootToken: nextId('root'),
        publishedAt: now,
        updatedAt: now,
      };
      rows.set(party.id, party);
      return ok(party);
    },
    async findBySlug(slug: string): Promise<Result<PublishedParty>> {
      for (const row of rows.values()) {
        if (row.slug === slug) return ok(row);
      }
      return err(PARTY_ERRORS.NOT_FOUND);
    },
    async findByOwnerAndLocalId(
      ownerId: string,
      localId: number,
    ): Promise<Result<PublishedParty>> {
      for (const row of rows.values()) {
        if (row.ownerId === ownerId && row.localId === localId) return ok(row);
      }
      return err(PARTY_ERRORS.NOT_FOUND);
    },
    async unpublish(ownerId: string, id: string): Promise<Result<void>> {
      const row = rows.get(id);
      if (!row || row.ownerId !== ownerId) return err(PARTY_ERRORS.NOT_FOUND);
      rows.delete(id);
      return ok(undefined);
    },
  };
}

export function fakeInvites(seed: Invite[] = []): InviteRepository & {
  rows: Map<string, Invite>;
} {
  const rows = new Map(seed.map((i) => [i.id, i]));

  const confirmedCount = (partyId: string, excluding?: string) =>
    [...rows.values()].filter(
      (i) =>
        i.partyId === partyId && i.status === 'confirmed' && i.id !== excluding,
    ).length;

  return {
    rows,
    async open({
      partyId,
      referrerToken,
      rootToken,
      existingInviteId,
    }): Promise<Result<Invite>> {
      if (existingInviteId) {
        const existing = rows.get(existingInviteId);
        if (existing && existing.partyId === partyId) return ok(existing);
      }

      let depth = 0;
      let referrerId: string | null = null;
      if (referrerToken && referrerToken !== rootToken) {
        for (const row of rows.values()) {
          if (row.forwardToken === referrerToken && row.partyId === partyId) {
            referrerId = row.id;
            depth = row.depth + 1;
            break;
          }
        }
      }

      const invite: Invite = {
        id: nextId('invite'),
        partyId,
        name: null,
        status: 'opened',
        depth,
        referrerId,
        forwardToken: nextId('fwd'),
        checkedIn: false,
        checkedInAt: null,
        openedAt: new Date().toISOString(),
        answeredAt: null,
      };
      rows.set(invite.id, invite);
      return ok(invite);
    },
    async findById(id: string): Promise<Result<Invite>> {
      const row = rows.get(id);
      return row ? ok(row) : err(INVITE_ERRORS.NOT_FOUND);
    },
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
      const row = rows.get(inviteId);
      if (!row || row.partyId !== partyId) return err(INVITE_ERRORS.NOT_FOUND);

      if (
        answer === 'confirmed' &&
        maxCapacity !== null &&
        confirmedCount(partyId, inviteId) >= maxCapacity
      ) {
        return err(INVITE_ERRORS.PARTY_FULL);
      }

      const updated: Invite = {
        ...row,
        name,
        status: answer,
        answeredAt: new Date().toISOString(),
      };
      rows.set(inviteId, updated);
      return ok(updated);
    },
    async setStatus({
      inviteId,
      partyId,
      status,
    }: {
      inviteId: string;
      partyId: string;
      status: InviteStatus;
    }): Promise<Result<Invite>> {
      const row = rows.get(inviteId);
      if (!row || row.partyId !== partyId) return err(INVITE_ERRORS.NOT_FOUND);
      const updated: Invite = {
        ...row,
        status,
        answeredAt: status === 'opened' ? null : new Date().toISOString(),
      };
      rows.set(inviteId, updated);
      return ok(updated);
    },

    async listForParty(partyId: string): Promise<Result<InviteWithReferrer[]>> {
      const list = [...rows.values()]
        .filter((i) => i.partyId === partyId)
        .sort(
          (a, b) =>
            a.openedAt.localeCompare(b.openedAt) || a.id.localeCompare(b.id),
        )
        .map((invite) => ({
          ...invite,
          referrerName: invite.referrerId
            ? (rows.get(invite.referrerId)?.name ?? null)
            : null,
        }));
      return ok(list);
    },
    async countConfirmed(partyId: string): Promise<Result<number>> {
      return ok(confirmedCount(partyId));
    },
  };
}
