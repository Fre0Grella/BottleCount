import type { PartyDocument } from '../../../../shared/collab';
import { isPartyRole } from '../../../../shared/collab';
import type { MergePatch } from '../../../../shared/patch';
import type { PublishPartyRequest } from '../../../../shared/invites';
import { newSlug, newToken } from '../../lib/tokens';
import {
  PARTY_ERRORS,
  type PartyRepository,
  type PartySummary,
  type PublishedParty,
} from '../partyRepository';
import { err, ok, type Result } from '../result';

interface PartyRow {
  id: string;
  owner_id: string;
  local_id: number;
  slug: string;
  name: string;
  date: string;
  cover: number;
  venue_place: string;
  venue_city: string;
  venue_time: string;
  allow_forward: number;
  max_capacity: number | null;
  root_token: string;
  published_at: string;
  updated_at: string;
  document: string | null;
  version: number;
  invites_open: number;
  ticket_key: string | null;
}

/**
 * The stored document, or null when it cannot be read.
 *
 * A row written before documents existed has NULL here. A row whose JSON has
 * somehow gone bad is the same situation from the caller's side — there is no
 * document to serve — and turning it into a throw would take down a request
 * that could have degraded.
 */
function parseTicketKey(raw: string | null): JsonWebKey | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as JsonWebKey;
  } catch {
    return null;
  }
}

function parseDocument(raw: string | null): PartyDocument | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as PartyDocument;
  } catch {
    return null;
  }
}

/**
 * The card columns (`name`, `date`, `cover`, the venue, `allow_forward`,
 * `max_capacity`) duplicate fields that also live inside the document. Reading
 * them from the document when there is one is what makes that duplication safe:
 * a patch only has to write the document, and the two can never drift, because
 * only one of them is ever believed.
 *
 * The columns remain for rows written before documents existed, and because
 * `listForUser` and the guest-facing card want them without parsing JSON.
 */
function toParty(row: PartyRow): PublishedParty {
  const document = parseDocument(row.document);
  if (document) {
    return {
      id: row.id,
      ownerId: row.owner_id,
      localId: row.local_id,
      slug: row.slug,
      name: document.name,
      date: document.date,
      cover: document.cover,
      venue: document.venue,
      allowForward: document.allowForward,
      maxCapacity: document.settings.max_capacity,
      rootToken: row.root_token,
      publishedAt: row.published_at,
      updatedAt: row.updated_at,
      document,
      version: row.version,
      invitesOpen: row.invites_open === 1,
      ticketKey: parseTicketKey(row.ticket_key),
    };
  }

  return {
    id: row.id,
    ownerId: row.owner_id,
    localId: row.local_id,
    slug: row.slug,
    name: row.name,
    date: row.date,
    cover: row.cover,
    venue: {
      place: row.venue_place,
      city: row.venue_city,
      time: row.venue_time,
    },
    allowForward: row.allow_forward === 1,
    maxCapacity: row.max_capacity,
    rootToken: row.root_token,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    document: null,
    version: row.version,
    invitesOpen: row.invites_open === 1,
    ticketKey: parseTicketKey(row.ticket_key),
  };
}

/**
 * A fresh HMAC-SHA256 key, exported as a JWK.
 *
 * Generated on the server so no client decides it, and exported because
 * IndexedDB — where the browser will keep its copy — cannot structured-clone a
 * CryptoKey.
 */
async function newTicketKey(): Promise<string> {
  // `generateKey` is typed as possibly returning a key *pair*; HMAC never does,
  // but the signature covers RSA and EC too.
  const key = (await crypto.subtle.generateKey(
    { name: 'HMAC', hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  )) as CryptoKey;
  return JSON.stringify(await crypto.subtle.exportKey('jwk', key));
}

export class PartyRepositoryD1 implements PartyRepository {
  constructor(private readonly db: D1Database) {}

  async publish(
    ownerId: string,
    snapshot: PublishPartyRequest,
  ): Promise<Result<PublishedParty>> {
    const now = new Date().toISOString();
    const doc = snapshot.document;

    // ON CONFLICT rather than a read-then-write: republishing is what happens
    // on every save, so it has to be one round trip and safe against two
    // devices doing it at once.
    //
    // `slug` and `root_token` are excluded from the update set on purpose. They
    // are already out in the world on links the host has sent; rotating them on
    // an edit would silently break every invitation. `invites_open` is excluded
    // for the same reason in reverse — storing the party must not reopen a link
    // the owner has closed.
    //
    // The card columns are derived from the document rather than sent beside
    // it, so the party's name cannot mean one thing to a guest and another to
    // an organiser.
    const row = await this.db
      .prepare(
        `INSERT INTO parties (
           id, owner_id, local_id, slug, name, date, cover,
           venue_place, venue_city, venue_time,
           allow_forward, max_capacity, root_token,
           document, version, invites_open, ticket_key, published_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?, ?)
         ON CONFLICT (owner_id, local_id) DO UPDATE SET
           name = excluded.name,
           date = excluded.date,
           cover = excluded.cover,
           venue_place = excluded.venue_place,
           venue_city = excluded.venue_city,
           venue_time = excluded.venue_time,
           allow_forward = excluded.allow_forward,
           max_capacity = excluded.max_capacity,
           document = excluded.document,
           version = parties.version + 1,
           updated_at = excluded.updated_at
           -- ticket_key is deliberately absent: rotating it on every save would
           -- invalidate every ticket already in a guest's phone.
         RETURNING *`,
      )
      .bind(
        crypto.randomUUID(),
        ownerId,
        snapshot.localId,
        newSlug(doc.name),
        doc.name,
        doc.date,
        doc.cover,
        doc.venue.place,
        doc.venue.city,
        doc.venue.time,
        doc.allowForward ? 1 : 0,
        doc.settings.max_capacity,
        newToken(),
        JSON.stringify(doc),
        await newTicketKey(),
        now,
        now,
      )
      .first<PartyRow>();

    if (!row) return err(PARTY_ERRORS.NOT_FOUND);

    // The owner's membership row. A separate statement because the party's id
    // is only known after the upsert has resolved the conflict, and idempotent
    // so republishing does not disturb it. A party whose owner is not a member
    // would be invisible to the person who made it, so this runs on every
    // publish rather than only on insert — that way a row lost to a failure
    // here is repaired by the next save instead of stranding the party.
    await this.db
      .prepare(
        `INSERT INTO party_members (party_id, user_id, role, added_at)
         VALUES (?, ?, 'owner', ?)
         ON CONFLICT (party_id, user_id) DO NOTHING`,
      )
      .bind(row.id, ownerId, now)
      .run();

    return ok(toParty(row));
  }

  async findBySlug(slug: string): Promise<Result<PublishedParty>> {
    const row = await this.db
      .prepare('SELECT * FROM parties WHERE slug = ?')
      .bind(slug)
      .first<PartyRow>();
    return row ? ok(toParty(row)) : err(PARTY_ERRORS.NOT_FOUND);
  }

  async findByOwnerAndLocalId(
    ownerId: string,
    localId: number,
  ): Promise<Result<PublishedParty>> {
    const row = await this.db
      .prepare('SELECT * FROM parties WHERE owner_id = ? AND local_id = ?')
      .bind(ownerId, localId)
      .first<PartyRow>();
    return row ? ok(toParty(row)) : err(PARTY_ERRORS.NOT_FOUND);
  }

  async findById(id: string): Promise<Result<PublishedParty>> {
    const row = await this.db
      .prepare('SELECT * FROM parties WHERE id = ?')
      .bind(id)
      .first<PartyRow>();
    return row ? ok(toParty(row)) : err(PARTY_ERRORS.NOT_FOUND);
  }

  async listForUser(userId: string): Promise<Result<PartySummary[]>> {
    const { results } = await this.db
      .prepare(
        `SELECT p.id, p.version, p.updated_at, m.role,
                -- Same rule as toParty: the document wins where there is one,
                -- so a patched party does not show its old name in the list.
                COALESCE(json_extract(p.document, '$.name'), p.name) AS name,
                COALESCE(json_extract(p.document, '$.date'), p.date) AS date,
                COALESCE(json_extract(p.document, '$.cover'), p.cover) AS cover,
                (SELECT COUNT(*) FROM party_members WHERE party_id = p.id) AS member_count
         FROM parties p
         JOIN party_members m ON m.party_id = p.id
         WHERE m.user_id = ?
         ORDER BY p.date DESC, p.updated_at DESC`,
      )
      .bind(userId)
      .all<{
        id: string;
        name: string;
        date: string;
        cover: number;
        version: number;
        updated_at: string;
        role: string;
        member_count: number;
      }>();

    return ok(
      results.map((row) => ({
        id: row.id,
        name: row.name,
        date: row.date,
        cover: row.cover,
        role: isPartyRole(row.role) ? row.role : 'editor',
        version: row.version,
        updatedAt: row.updated_at,
        memberCount: row.member_count,
      })),
    );
  }

  async patchDocument({
    partyId,
    patch,
  }: {
    partyId: string;
    patch: MergePatch;
  }): Promise<
    Result<{ document: PartyDocument; version: number; updatedAt: string }>
  > {
    // `json_patch` is SQLite's RFC 7386 merge — the same rules
    // `shared/patch.ts` implements for the client, so both sides agree on what
    // a patch means without either reimplementing the other.
    //
    // Read, merge and write are one statement on purpose. Two co-organisers
    // saving at the same moment would otherwise both read the same document and
    // write back over each other, which is exactly the loss patching exists to
    // prevent.
    //
    // It touches only the document. The card columns are derived from it on
    // read (see `toParty`), so there is nothing here to keep in step.
    const row = await this.db
      .prepare(
        `UPDATE parties
         SET document = json_patch(document, ?),
             version = version + 1,
             updated_at = ?
         WHERE id = ? AND document IS NOT NULL
         RETURNING *`,
      )
      .bind(JSON.stringify(patch), new Date().toISOString(), partyId)
      .first<PartyRow>();

    if (!row) {
      // Either the party is gone or it predates document storage; the caller
      // needs to tell those apart to choose between 404 and "store it first".
      const existing = await this.findById(partyId);
      return err(
        existing.ok ? PARTY_ERRORS.NO_DOCUMENT : PARTY_ERRORS.NOT_FOUND,
      );
    }

    const document = parseDocument(row.document);
    if (!document) return err(PARTY_ERRORS.NO_DOCUMENT);

    return ok({ document, version: row.version, updatedAt: row.updated_at });
  }

  async putDocument({
    partyId,
    document,
  }: {
    partyId: string;
    document: PartyDocument;
  }): Promise<Result<{ version: number; updatedAt: string }>> {
    const row = await this.db
      .prepare(
        `UPDATE parties SET document = ?, version = version + 1, updated_at = ?
         WHERE id = ? RETURNING version, updated_at`,
      )
      .bind(JSON.stringify(document), new Date().toISOString(), partyId)
      .first<{ version: number; updated_at: string }>();

    return row
      ? ok({ version: row.version, updatedAt: row.updated_at })
      : err(PARTY_ERRORS.NOT_FOUND);
  }

  async setInvitesOpen(
    id: string,
    open: boolean,
  ): Promise<Result<PublishedParty>> {
    const row = await this.db
      .prepare(
        'UPDATE parties SET invites_open = ?, updated_at = ? WHERE id = ? RETURNING *',
      )
      .bind(open ? 1 : 0, new Date().toISOString(), id)
      .first<PartyRow>();
    return row ? ok(toParty(row)) : err(PARTY_ERRORS.NOT_FOUND);
  }

  async deleteById(id: string): Promise<Result<void>> {
    const result = await this.db
      .prepare('DELETE FROM parties WHERE id = ?')
      .bind(id)
      .run();
    return result.meta.changes > 0
      ? ok(undefined)
      : err(PARTY_ERRORS.NOT_FOUND);
  }

  async unpublish(ownerId: string, id: string): Promise<Result<void>> {
    // The owner check is in the WHERE clause, not a prior SELECT: a separate
    // read would let another request change ownership in between, and it also
    // means a party someone else owns is indistinguishable from one that does
    // not exist.
    const result = await this.db
      .prepare('DELETE FROM parties WHERE id = ? AND owner_id = ?')
      .bind(id, ownerId)
      .run();

    return result.meta.changes > 0
      ? ok(undefined)
      : err(PARTY_ERRORS.NOT_FOUND);
  }
}
