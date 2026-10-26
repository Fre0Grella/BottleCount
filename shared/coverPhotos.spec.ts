import { describe, expect, it } from 'vitest';
import { isCoverPhotoToken, sniffCoverPhoto } from './coverPhotos';

const bytes = (...values: (number | string)[]) =>
  new Uint8Array(
    values.flatMap((v) =>
      typeof v === 'string' ? [...v].map((ch) => ch.charCodeAt(0)) : [v],
    ),
  );

describe('sniffCoverPhoto', () => {
  it('knows a WebP and a JPEG by their headers', () => {
    expect(sniffCoverPhoto(bytes('RIFF', 0, 0, 0, 0, 'WEBP', 'VP8 '))).toBe(
      'image/webp',
    );
    expect(sniffCoverPhoto(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg');
  });

  it('refuses everything else, whatever it is called', () => {
    for (const file of [
      bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a),
      bytes('GIF89a'),
      bytes('<svg xmlns="http://www.w3.org/2000/svg">'),
      bytes('RIFF', 0, 0, 0, 0, 'WAVE'),
      bytes(0xff, 0xd8),
      bytes(),
    ]) {
      expect(sniffCoverPhoto(file)).toBeNull();
    }
  });
});

describe('isCoverPhotoToken', () => {
  it('takes the 20 characters the Worker draws, and nothing else', () => {
    expect(isCoverPhotoToken('abcdefghjkmnpqrstuvw')).toBe(true);
    for (const value of [
      'abcdefghjkmnpqrstuv',
      'ABCDEFGHJKMNPQRSTUVW',
      'abcdefghjkmnpqrst/..',
      'abcdefghjkmnpqrstuv0',
      42,
    ]) {
      expect(isCoverPhotoToken(value)).toBe(false);
    }
  });
});
