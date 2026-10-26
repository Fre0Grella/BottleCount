/**
 * Cover photos in R2: the one place that knows how they are keyed, and the
 * budget that keeps them free (ADR 0007).
 *
 * Every photo of a party lives under `covers/<partyId>/<token>`. A document
 * can only name a token, never a key, so it cannot point at another party's
 * photo, and the ledger (`CoverPhotoRepository`) says which token is current,
 * so a replaced or removed photo is never served again.
 *
 * R2 has no spending cap of its own. This module is it: every operation that
 * R2 bills is spent from a daily budget first, and refused once the day's is
 * gone, so the bucket cannot leave the free tier whatever happens to traffic.
 * Deletes are free in R2 and are never refused.
 */

import type { CoverPhotoType } from '../../../shared/coverPhotos';
import { isCoverPhotoToken } from '../../../shared/coverPhotos';
import type {
  CoverPhotoRepository,
  R2Spend,
} from '../repositories/coverPhotoRepository';
import { newToken } from './tokens';

/**
 * Far inside R2's free tier on purpose: 10 GB stored, 1M Class A and 10M
 * Class B operations a month. Daily limits, because Cloudflare bills from the
 * account's billing date: any 31 days of these stay under the allowance, where
 * a calendar-month counter could put two full months in one bill.
 */
export const R2_BUDGET = {
  /** Half the free 10 GB, so a miscount or a race cannot get near it. */
  storageBytes: 5_000_000_000,
  /** Uploads (Class A). 31 days of them is 15,500, under 2% of 1M. */
  writesPerDay: 500,
  /**
   * Photos served (Class B). 31 days is 930,000, under a tenth of 10M. Each
   * is also one D1 row written, under a third of D1's free 100,000 a day.
   */
  readsPerDay: 30_000,
} as const;

/** Why an upload was refused. */
export const COVER_REFUSALS = {
  /** Today's uploads are spent; tomorrow's are not. */
  BUDGET: 'cover_photo_budget',
  /** The bucket is at its storage cap until photos are removed. */
  FULL: 'cover_photo_storage_full',
} as const;

type Refusal = (typeof COVER_REFUSALS)[keyof typeof COVER_REFUSALS];

/** Just what is used of R2, so a test can stand in for it. */
export type CoverBucket = Pick<R2Bucket, 'put' | 'get' | 'delete'>;

function keyOf(partyId: string, token: string): string {
  return `covers/${partyId}/${token}`;
}

function today(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** One operation from today's budget for `kind`; false when there is none. */
async function spend(
  ledger: CoverPhotoRepository,
  kind: R2Spend,
  now: Date,
): Promise<boolean> {
  const limit =
    kind === 'write' ? R2_BUDGET.writesPerDay : R2_BUDGET.readsPerDay;
  const spent = await ledger.spend(kind, today(now), limit);
  // A ledger that cannot answer is a budget that cannot be checked: refuse.
  return spent.ok && spent.value;
}

/**
 * Stores a photo under a fresh token and removes the party's previous one,
 * or says why it may not. The token is new on every upload, so a cached copy
 * of the old photo can never stand in for the new one.
 */
export async function storeCoverPhoto(
  bucket: CoverBucket,
  ledger: CoverPhotoRepository,
  partyId: string,
  bytes: Uint8Array,
  type: CoverPhotoType,
  now = new Date(),
): Promise<{ token: string } | { refused: Refusal }> {
  const previous = await ledger.find(partyId);
  const total = await ledger.totalBytes();
  if (!previous.ok || !total.ok) return { refused: COVER_REFUSALS.BUDGET };

  // What is stored once this replaces the party's current photo.
  const after = total.value - (previous.value?.bytes ?? 0) + bytes.byteLength;
  if (after > R2_BUDGET.storageBytes) return { refused: COVER_REFUSALS.FULL };
  if (!(await spend(ledger, 'write', now))) {
    return { refused: COVER_REFUSALS.BUDGET };
  }

  const token = newToken();
  // Recorded before the object exists, so the ledger never under-counts what
  // the bucket holds; a failed put takes the record back out.
  await ledger.save({ partyId, token, bytes: bytes.byteLength });
  try {
    await bucket.put(keyOf(partyId, token), bytes, {
      httpMetadata: { contentType: type },
    });
  } catch (error) {
    await ledger.remove(partyId);
    throw error;
  } finally {
    // The ledger no longer counts it either way, so it must not stay behind.
    if (previous.value) {
      await bucket.delete(keyOf(partyId, previous.value.token));
    }
  }
  return { token };
}

/** Removes the party's photo, object first and record after. */
export async function deleteCoverPhoto(
  bucket: CoverBucket,
  ledger: CoverPhotoRepository,
  partyId: string,
): Promise<void> {
  const current = await ledger.find(partyId);
  if (current.ok && current.value) {
    await bucket.delete(keyOf(partyId, current.value.token));
  }
  await ledger.remove(partyId);
}

const notFound = () =>
  Response.json({ error: 'cover_photo_not_found' }, { status: 404 });

/**
 * The photo, or the answer that stands in for it: 404 when the token is not
 * the party's current photo (or there is no bucket), 503 once today's reads
 * are spent, which the pages show as the emoji cover. `cacheControl` is the
 * caller's: an organiser's copy and a guest's are cached differently.
 */
export async function coverPhotoResponse(
  bucket: CoverBucket | undefined,
  ledger: CoverPhotoRepository,
  partyId: string,
  token: string,
  cacheControl: string,
  now = new Date(),
): Promise<Response> {
  if (!bucket || !isCoverPhotoToken(token)) return notFound();
  const current = await ledger.find(partyId);
  if (!current.ok || current.value?.token !== token) return notFound();
  if (!(await spend(ledger, 'read', now))) {
    return Response.json(
      { error: COVER_REFUSALS.BUDGET },
      { status: 503, headers: { 'retry-after': '3600' } },
    );
  }

  const object = await bucket.get(keyOf(partyId, token));
  if (!object || !('body' in object)) return notFound();
  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'image/webp',
      'cache-control': cacheControl,
      // The bytes are ours to vouch for only as an image: no sniffing them
      // into anything else.
      'x-content-type-options': 'nosniff',
    },
  });
}
