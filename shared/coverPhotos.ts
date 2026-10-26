/**
 * Party cover photos, the part the Worker and the frontend must agree on
 * (ADR 0007).
 *
 * Often not a photo at all but the party's poster, with the details written on
 * it, so the limits are set for text to stay legible, and the image is never
 * cropped wherever it is shown.
 *
 * The browser shrinks and re-encodes a photo before it is sent — that is what
 * keeps storage small and strips EXIF, location included — and the Worker
 * refuses anything that is not an image of the right kind and size. A party
 * has one photo at most; its document holds the photo's token, and the bytes
 * live in R2.
 */

/**
 * Enough for a 2000px poster in WebP with its small print readable; about
 * 14,000 of them fit R2's free 10 GB.
 */
export const COVER_PHOTO_MAX_BYTES = 750_000;

/**
 * The longest side, in pixels, the browser scales an image down to: a poster
 * stays sharp across a phone's width at 3x, and when zoomed on a laptop.
 */
export const COVER_PHOTO_MAX_EDGE = 2000;

export type CoverPhotoType = 'image/webp' | 'image/jpeg';

/**
 * What the bytes are, read from their header rather than from a content type
 * anyone can set: `RIFF....WEBP`, or JPEG's `FF D8 FF`. Anything else is null,
 * which is what keeps the bucket from hosting files that are not photos.
 */
export function sniffCoverPhoto(bytes: Uint8Array): CoverPhotoType | null {
  const ascii = (from: number, to: number) =>
    String.fromCharCode(...bytes.subarray(from, to));
  if (bytes.length >= 12 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  return null;
}

/**
 * The token the Worker names a photo with: 20 characters of the invite-token
 * alphabet. Checked wherever one arrives in a document or a URL, so neither can
 * point anywhere but at a photo of its own party.
 */
export function isCoverPhotoToken(value: unknown): value is string {
  return typeof value === 'string' && /^[a-z2-9]{20}$/.test(value);
}
