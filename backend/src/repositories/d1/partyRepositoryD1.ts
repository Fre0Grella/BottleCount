import type { PublishPartyRequest } from '../../../../shared/invites';
import { newSlug, newToken } from '../../lib/tokens';
import {
  PARTY_ERRORS,
  type PartyRepository,
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
}

function toParty(row: PartyRow): PublishedParty {
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
  };
}

export class PartyRepositoryD1 implements PartyRepository {
  constructor(private readonly db: D1Database) {}

  async publish(
    ownerId: string,
    snapshot: PublishPartyRequest,
  ): Promise<Result<PublishedParty>> {
    const now = new Date().toISOString();

    // ON CONFLICT rather than a read-then-write: republishing is what happens
    // every time the host opens the share sheet, so it has to be one round trip
    // and it has to be safe against two devices doing it at once.
    //
    // `slug` and `root_token` are excluded from the update set on purpose. They
    // are already out in the world on links the host has sent; rotating them on
    // an edit would silently break every invitation.
    const row = await this.db
      .prepare(
        `INSERT INTO parties (
           id, owner_id, local_id, slug, name, date, cover,
           venue_place, venue_city, venue_time,
           allow_forward, max_capacity, root_token, published_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (owner_id, local_id) DO UPDATE SET
           name = excluded.name,
           date = excluded.date,
           cover = excluded.cover,
           venue_place = excluded.venue_place,
           venue_city = excluded.venue_city,
           venue_time = excluded.venue_time,
           allow_forward = excluded.allow_forward,
           max_capacity = excluded.max_capacity,
           updated_at = excluded.updated_at
         RETURNING *`,
      )
      .bind(
        crypto.randomUUID(),
        ownerId,
        snapshot.localId,
        newSlug(snapshot.name),
        snapshot.name,
        snapshot.date,
        snapshot.cover,
        snapshot.venue.place,
        snapshot.venue.city,
        snapshot.venue.time,
        snapshot.allowForward ? 1 : 0,
        snapshot.maxCapacity,
        newToken(),
        now,
        now,
      )
      .first<PartyRow>();

    return row ? ok(toParty(row)) : err(PARTY_ERRORS.NOT_FOUND);
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
