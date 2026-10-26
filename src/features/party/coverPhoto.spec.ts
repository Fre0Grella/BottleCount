import { describe, expect, it, vi } from 'vitest';
import {
  COVER_PHOTO_MAX_BYTES,
  COVER_PHOTO_MAX_EDGE,
} from '../../../shared/coverPhotos';
import {
  fitWithin,
  guestPhotoUrl,
  organiserPhotoUrl,
  smallestFit,
} from './coverPhoto';

const blobOf = (size: number) => new Blob([new Uint8Array(size)]);

describe('fitWithin', () => {
  it('scales the longest side down to the limit, keeping the shape', () => {
    // A portrait A-series poster, as a phone photographs it.
    expect(fitWithin(3000, 4243, 2000)).toEqual({ width: 1414, height: 2000 });
    expect(fitWithin(4000, 3000, 2000)).toEqual({ width: 2000, height: 1500 });
  });

  it('never scales a small image up', () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ width: 800, height: 600 });
  });
});

describe('smallestFit', () => {
  it('keeps the first encoding that fits, at full size and best quality', async () => {
    const encode = vi.fn(async () => blobOf(1000));
    await smallestFit(encode);
    expect(encode).toHaveBeenCalledTimes(1);
    expect(encode).toHaveBeenCalledWith(COVER_PHOTO_MAX_EDGE, 0.9);
  });

  // Quality goes first, then size: a poster's text survives a lower quality
  // better than fewer pixels.
  it('lowers the quality before the size', async () => {
    const encode = vi.fn(async (edge: number, quality: number) =>
      blobOf(edge === COVER_PHOTO_MAX_EDGE && quality < 0.7 ? 10 : 10 ** 7),
    );
    const blob = await smallestFit(encode);
    expect(blob?.size).toBe(10);
    expect(encode.mock.calls.map(([, q]) => q)).toEqual([
      0.9, 0.82, 0.74, 0.66,
    ]);
  });

  it('then shrinks the image until it fits', async () => {
    const encode = vi.fn(async (edge: number) =>
      blobOf(edge < 1200 ? COVER_PHOTO_MAX_BYTES : COVER_PHOTO_MAX_BYTES + 1),
    );
    await smallestFit(encode);
    expect(encode.mock.lastCall?.[0]).toBe(1125);
  });

  it('gives up rather than ship something unreadably small', async () => {
    const encode = vi.fn(async (_edge: number, _quality: number) =>
      blobOf(COVER_PHOTO_MAX_BYTES + 1),
    );
    expect(await smallestFit(encode)).toBeNull();
    expect(
      Math.min(...encode.mock.calls.map(([edge]) => edge)),
    ).toBeGreaterThanOrEqual(800);
  });
});

describe('photo URLs', () => {
  it('fetch an organiser copy behind membership, a guest copy behind the link', () => {
    expect(organiserPhotoUrl('p 1', 'tok')).toBe(
      '/api/parties/p%201/cover/tok',
    );
    expect(guestPhotoUrl('rooftop-ab', 'tok')).toBe(
      '/invite/rooftop-ab/cover/tok',
    );
  });
});
