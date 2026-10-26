import type { PhotoSlot } from '../../../../shared/coverPhotos';
import { isPhotoSlot } from '../../../../shared/coverPhotos';
import type {
  CoverPhotoRepository,
  R2Spend,
  StoredCoverPhoto,
} from '../coverPhotoRepository';
import { ok, type Result } from '../result';

interface PhotoRow {
  party_id: string;
  slot: string;
  token: string;
  bytes: number;
}

/** A row as a photo; a slot this code does not know is no photo of its. */
function toPhoto(row: PhotoRow): StoredCoverPhoto | null {
  return isPhotoSlot(row.slot)
    ? {
        partyId: row.party_id,
        slot: row.slot,
        token: row.token,
        bytes: row.bytes,
      }
    : null;
}

export class CoverPhotoRepositoryD1 implements CoverPhotoRepository {
  constructor(private readonly db: D1Database) {}

  async find(
    partyId: string,
    slot: PhotoSlot,
  ): Promise<Result<StoredCoverPhoto | null>> {
    const row = await this.db
      .prepare(
        `SELECT party_id, slot, token, bytes FROM party_photos
         WHERE party_id = ? AND slot = ?`,
      )
      .bind(partyId, slot)
      .first<PhotoRow>();
    return ok(row ? toPhoto(row) : null);
  }

  async listForParty(partyId: string): Promise<Result<StoredCoverPhoto[]>> {
    const { results } = await this.db
      .prepare(
        'SELECT party_id, slot, token, bytes FROM party_photos WHERE party_id = ?',
      )
      .bind(partyId)
      .all<PhotoRow>();
    return ok(
      results.flatMap((row) => {
        const photo = toPhoto(row);
        return photo ? [photo] : [];
      }),
    );
  }

  async totalBytes(): Promise<Result<number>> {
    // Every row, known slot or not: the bytes are in the bucket either way.
    const row = await this.db
      .prepare('SELECT COALESCE(SUM(bytes), 0) AS total FROM party_photos')
      .first<{ total: number }>();
    return ok(row?.total ?? 0);
  }

  async save(photo: StoredCoverPhoto): Promise<Result<void>> {
    await this.db
      .prepare(
        `INSERT INTO party_photos (party_id, slot, token, bytes, stored_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (party_id, slot) DO UPDATE SET
           token = excluded.token,
           bytes = excluded.bytes,
           stored_at = excluded.stored_at`,
      )
      .bind(
        photo.partyId,
        photo.slot,
        photo.token,
        photo.bytes,
        new Date().toISOString(),
      )
      .run();
    return ok(undefined);
  }

  async remove(partyId: string, slot: PhotoSlot): Promise<Result<void>> {
    await this.db
      .prepare('DELETE FROM party_photos WHERE party_id = ? AND slot = ?')
      .bind(partyId, slot)
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
