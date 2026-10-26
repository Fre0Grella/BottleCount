import {
  COVER_PHOTO_MAX_BYTES,
  COVER_PHOTO_MAX_EDGE,
} from '../../../shared/coverPhotos';

/**
 * A party's photo or poster on the way up, and where to fetch it back
 * (ADR 0007).
 *
 * The browser does the shrinking: drawing the image onto a canvas and
 * encoding that is what makes it small, and it is also what strips the EXIF
 * block, location included, since a canvas carries pixels and nothing else.
 *
 * No store or database imports: the invite page pulls this in.
 */

/** Tried in order until one fits; high first, for a poster's small print. */
const QUALITIES = [0.9, 0.82, 0.74, 0.66];

/** After the qualities run out, the longest side shrinks by this and it tries again. */
const EDGE_STEP = 0.75;
const MIN_EDGE = 800;

/** `width` × `height` scaled to fit `max` on the longest side, never up. */
export function fitWithin(
  width: number,
  height: number,
  max: number,
): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * The first encoding under the size limit: every quality at full size, then
 * again a size smaller, down to {@link MIN_EDGE}. Null when nothing fits, which
 * a real photo never reaches.
 */
export async function smallestFit(
  encode: (edge: number, quality: number) => Promise<Blob | null>,
): Promise<Blob | null> {
  for (
    let edge = COVER_PHOTO_MAX_EDGE;
    edge >= MIN_EDGE;
    edge = Math.round(edge * EDGE_STEP)
  ) {
    for (const quality of QUALITIES) {
      const blob = await encode(edge, quality);
      if (blob && blob.size <= COVER_PHOTO_MAX_BYTES) return blob;
    }
  }
  return null;
}

function toBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * The photo the host picked, ready to upload: at most
 * {@link COVER_PHOTO_MAX_EDGE} on its longest side, under
 * {@link COVER_PHOTO_MAX_BYTES}, as WebP — or JPEG where the browser cannot
 * encode WebP (Safari). Null when the file is not an image the browser can
 * read.
 */
export async function shrinkCoverPhoto(file: Blob): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    // Honours the EXIF orientation, so a phone photo is upright once the
    // EXIF itself is gone.
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    return null;
  }

  try {
    return await smallestFit(async (edge, quality) => {
      const { width, height } = fitWithin(bitmap.width, bitmap.height, edge);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      // JPEG has no transparency, and a transparent PNG would turn black.
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);

      const webp = await toBlob(canvas, 'image/webp', quality);
      if (webp?.type === 'image/webp') return webp;
      return toBlob(canvas, 'image/jpeg', quality);
    });
  } finally {
    bitmap.close();
  }
}

/** The photo as an organiser fetches it: behind their membership. */
export function organiserPhotoUrl(remoteId: string, token: string): string {
  return `/api/parties/${encodeURIComponent(remoteId)}/cover/${encodeURIComponent(token)}`;
}

/** The photo as a guest fetches it: behind the open invite link. */
export function guestPhotoUrl(slug: string, token: string): string {
  return `/invite/${encodeURIComponent(slug)}/cover/${encodeURIComponent(token)}`;
}
