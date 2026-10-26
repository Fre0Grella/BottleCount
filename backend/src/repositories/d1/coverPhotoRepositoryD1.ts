import type {
  CoverPhotoRepository,
  R2Spend,
  StoredCoverPhoto,
} from '../coverPhotoRepository';
import { ok, type Result } from '../result';

interface CoverPhotoRow {
  party_id: string;
  token: string;
  bytes: number;
}

export class CoverPhotoRepositoryD1 implements CoverPhotoRepository {
  constructor(private readonly db: D1Database) {}

  async find(partyId: string): Promise<Result<StoredCoverPhoto | null>> {
    const row = await this.db
      .prepare(
        'SELECT party_id, token, bytes FROM cover_photos WHERE party_id = ?',
      )
      .bind(partyId)
      .first<CoverPhotoRow>();
    return ok(
      row
        ? { partyId: row.party_id, token: row.token, bytes: row.bytes }
        : null,
    );
  }

  async totalBytes(): Promise<Result<number>> {
    const row = await this.db
      .prepare('SELECT COALESCE(SUM(bytes), 0) AS total FROM cover_photos')
      .first<{ total: number }>();
    return ok(row?.total ?? 0);
  }

  async save(photo: StoredCoverPhoto): Promise<Result<void>> {
    await this.db
      .prepare(
        `INSERT INTO cover_photos (party_id, token, bytes, stored_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (party_id) DO UPDATE SET
           token = excluded.token,
           bytes = excluded.bytes,
           stored_at = excluded.stored_at`,
      )
      .bind(photo.partyId, photo.token, photo.bytes, new Date().toISOString())
      .run();
    return ok(undefined);
  }

  async remove(partyId: string): Promise<Result<void>> {
    await this.db
      .prepare('DELETE FROM cover_photos WHERE party_id = ?')
      .bind(partyId)
      .run();
    return ok(undefined);
  }

  async spend(
    kind: R2Spend,
    day: string,
    limit: number,
  ): Promise<Result<boolean>> {
    // One statement: the first of the day inserts 1, every later one adds 1
    // only while under the limit. Over it, the update matches nothing and
    // RETURNING yields no row, which is the answer "spent".
    const row = await this.db
      .prepare(
        `INSERT INTO r2_usage (day, kind, count) VALUES (?1, ?2, 1)
         ON CONFLICT (day, kind) DO UPDATE SET count = count + 1
           WHERE count < ?3
         RETURNING count`,
      )
      .bind(day, kind, limit)
      .first<{ count: number }>();
    return ok(row !== null && row.count <= limit);
  }
}
