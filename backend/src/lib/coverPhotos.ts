/**
 * Cover photos in R2: the one place that knows how they are keyed (ADR 0007).
 *
 * Every photo of a party lives under `covers/<partyId>/`, so one prefix is the
 * whole of a party's storage: replacing a photo, removing it and deleting the
 * party all come down to clearing that prefix. A document can only name a
 * token, never a key, so it cannot point at another party's photo.
 */

import type { CoverPhotoType } from '../../../shared/coverPhotos';
import { isCoverPhotoToken } from '../../../shared/coverPhotos';
import { newToken } from './tokens';

/** Just what is used of R2, so a test can stand in for it. */
export type CoverBucket = Pick<R2Bucket, 'put' | 'get' | 'delete' | 'list'>;

function prefixOf(partyId: string): string {
  return `covers/${partyId}/`;
}

/** Every key under the party's prefix, except `keep`. */
async function keysOf(
  bucket: CoverBucket,
  partyId: string,
  keep?: string,
): Promise<string[]> {
  // One photo per party, so a page of 1000 is always the whole prefix; the
  // loop is for the leftovers of a race between two uploads.
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: prefixOf(partyId), cursor });
    keys.push(...page.objects.map((o) => o.key).filter((k) => k !== keep));
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return keys;
}

/**
 * Stores a photo under a fresh token and removes the party's previous one.
 * The token is new on every upload, so a cached copy of the old photo can
 * never stand in for the new one.
 */
export async function storeCoverPhoto(
  bucket: CoverBucket,
  partyId: string,
  bytes: Uint8Array,
  type: CoverPhotoType,
): Promise<string> {
  const token = newToken();
  const key = `${prefixOf(partyId)}${token}`;
  await bucket.put(key, bytes, { httpMetadata: { contentType: type } });
  const stale = await keysOf(bucket, partyId, key);
  if (stale.length) await bucket.delete(stale);
  return token;
}

/** Removes every photo the party has. Already gone is fine. */
export async function deleteCoverPhotos(
  bucket: CoverBucket,
  partyId: string,
): Promise<void> {
  const keys = await keysOf(bucket, partyId);
  if (keys.length) await bucket.delete(keys);
}

/**
 * The photo as a response, or null when the token is malformed or names
 * nothing. `cacheControl` is the caller's: an organiser's copy and a guest's
 * are served under different rules.
 */
export async function coverPhotoResponse(
  bucket: CoverBucket,
  partyId: string,
  token: string,
  cacheControl: string,
): Promise<Response | null> {
  if (!isCoverPhotoToken(token)) return null;
  const object = await bucket.get(`${prefixOf(partyId)}${token}`);
  if (!object || !('body' in object)) return null;
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
