import type { PartyDocument, PartyRole } from '../../../../shared/collab';
import { generateTicketCode } from '../../../../shared/tickets';
import { apply as applyPatch } from '../../../../shared/patch';
import type { MergePatch } from '../../../../shared/patch';
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
  type PartySummary,
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
  /** Membership, so `listForUser` can answer. Set by `fakeMembers`. */
  memberships: Map<string, Map<string, PartyRole>>;
} {
  const rows = new Map(seed.map((p) => [p.id, p]));
  const memberships = new Map<string, Map<string, PartyRole>>();

  return {
    rows,
    memberships,

    async publish(
      ownerId: string,
      snapshot: PublishPartyRequest,
    ): Promise<Result<PublishedParty>> {
      const now = new Date().toISOString();
      const doc = snapshot.document;

      for (const row of rows.values()) {
        if (row.ownerId === ownerId && row.localId === snapshot.localId) {
          // Republishing keeps the slug, the root token and whether the invite
          // link is open — links already sent have to keep working, and storing
          // the party must not reopen one the owner closed.
          const updated: PublishedParty = {
            ...row,
            name: doc.name,
            date: doc.date,
            cover: doc.cover,
            venue: doc.venue,
            allowForward: doc.allowForward,
            maxCapacity: doc.settings.max_capacity,
            document: doc,
            version: row.version + 1,
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
        slug: `${doc.name.toLowerCase().replace(/\W+/g, '-')}-${nextId('s')}`,
        name: doc.name,
        date: doc.date,
        cover: doc.cover,
        venue: doc.venue,
        allowForward: doc.allowForward,
        maxCapacity: doc.settings.max_capacity,
        rootToken: nextId('root'),
        publishedAt: now,
        updatedAt: now,
        document: doc,
        version: 1,
        invitesOpen: false,
        // A stand-in, not a real key: nothing in a route test signs anything.
        // What the tests care about is that every member gets the same one.
        ticketKey: { kty: 'oct', k: `key-${nextId('k')}` },
      };
      rows.set(party.id, party);

      const members = memberships.get(party.id) ?? new Map<string, PartyRole>();
      members.set(ownerId, 'owner');
      memberships.set(party.id, members);

      return ok(party);
    },

    async findBySlug(slug: string): Promise<Result<PublishedParty>> {
      for (const row of rows.values()) {
        if (row.slug === slug) return ok(row);
      }
      return err(PARTY_ERRORS.NOT_FOUND);
    },

    async findById(id: string): Promise<Result<PublishedParty>> {
      const row = rows.get(id);
      return row ? ok(row) : err(PARTY_ERRORS.NOT_FOUND);
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

    async listForUser(userId: string): Promise<Result<PartySummary[]>> {
      const out: PartySummary[] = [];
      for (const row of rows.values()) {
        const role = memberships.get(row.id)?.get(userId);
        if (!role) continue;
        out.push({
          id: row.id,
          name: row.name,
          date: row.date,
          cover: row.cover,
          role,
          version: row.version,
          updatedAt: row.updatedAt,
          memberCount: memberships.get(row.id)?.size ?? 1,
        });
      }
      return ok(out);
    },

    async patchDocument({
      partyId,
      patch,
    }: {
      partyId: string;
      patch: MergePatch;
    }): Promise<
      Result<{ document: PartyDocument; version: number; updatedAt: string }>
    > {
      const row = rows.get(partyId);
      if (!row) return err(PARTY_ERRORS.NOT_FOUND);
      if (!row.document) return err(PARTY_ERRORS.NO_DOCUMENT);

      // The same RFC 7386 rules SQLite's json_patch applies, via the shared
      // implementation — so a test exercises the semantics the real statement
      // has, even though it cannot exercise its atomicity.
      const document = applyPatch(
        row.document as unknown as Record<string, never>,
        patch,
      ) as unknown as PartyDocument;
      const updatedAt = new Date().toISOString();
      const updated: PublishedParty = {
        ...row,
        document,
        version: row.version + 1,
        updatedAt,
        name: document.name,
        date: document.date,
        cover: document.cover,
        venue: document.venue,
        allowForward: document.allowForward,
        maxCapacity: document.settings.max_capacity,
      };
      rows.set(partyId, updated);
      return ok({ document, version: updated.version, updatedAt });
    },

    async putDocument({
      partyId,
      document,
    }: {
      partyId: string;
      document: PartyDocument;
    }): Promise<Result<{ version: number; updatedAt: string }>> {
      const row = rows.get(partyId);
      if (!row) return err(PARTY_ERRORS.NOT_FOUND);
      const updatedAt = new Date().toISOString();
      rows.set(partyId, {
        ...row,
        document,
        version: row.version + 1,
        updatedAt,
      });
      return ok({ version: row.version + 1, updatedAt });
    },

    async setInvitesOpen(
      id: string,
      open: boolean,
    ): Promise<Result<PublishedParty>> {
      const row = rows.get(id);
      if (!row) return err(PARTY_ERRORS.NOT_FOUND);
      const updated = { ...row, invitesOpen: open };
      rows.set(id, updated);
      return ok(updated);
    },

    async deleteById(id: string): Promise<Result<void>> {
      return rows.delete(id) ? ok(undefined) : err(PARTY_ERRORS.NOT_FOUND);
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
        ticketCode: generateTicketCode(),
        source: 'link',
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

    async addManual({
      partyId,
      name,
    }: {
      partyId: string;
      name: string;
      ticketCode: string;
    }): Promise<Result<Invite>> {
      const now = new Date().toISOString();
      const invite: Invite = {
        id: nextId('invite'),
        partyId,
        name,
        status: 'confirmed',
        depth: 0,
        referrerId: null,
        forwardToken: nextId('fwd'),
        ticketCode: generateTicketCode(),
        source: 'manual',
        checkedIn: false,
        checkedInAt: null,
        openedAt: now,
        answeredAt: now,
      };
      rows.set(invite.id, invite);
      return ok(invite);
    },

    async checkIn({
      inviteId,
      partyId,
      at,
    }: {
      inviteId: string;
      partyId: string;
      at: string;
    }): Promise<Result<Invite>> {
      const row = rows.get(inviteId);
      if (!row || row.partyId !== partyId) return err(INVITE_ERRORS.NOT_FOUND);
      if (row.checkedIn) return err(INVITE_ERRORS.ALREADY_CHECKED_IN);
      const updated: Invite = { ...row, checkedIn: true, checkedInAt: at };
      rows.set(inviteId, updated);
      return ok(updated);
    },

    async undoCheckIn({
      inviteId,
      partyId,
    }: {
      inviteId: string;
      partyId: string;
    }): Promise<Result<Invite>> {
      const row = rows.get(inviteId);
      if (!row || row.partyId !== partyId) return err(INVITE_ERRORS.NOT_FOUND);
      const updated: Invite = { ...row, checkedIn: false, checkedInAt: null };
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
