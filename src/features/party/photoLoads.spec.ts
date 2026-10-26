import { describe, expect, it } from 'vitest';
import { usePhotoLoads } from './photoLoads';

describe('usePhotoLoads', () => {
  const url = '/api/parties/p1/photos/banner/abcdefghjkmnpqrstvwx';

  it('renders a photo but shows it only once it has loaded', () => {
    const photos = usePhotoLoads();
    expect(photos.usable(url)).toBe(url);
    expect(photos.shown(url)).toBe(false);

    photos.onLoad(url);
    expect(photos.shown(url)).toBe(true);
  });

  it('drops a photo that failed, for good', () => {
    const photos = usePhotoLoads();
    photos.onError(url);
    expect(photos.usable(url)).toBeNull();
    expect(photos.shown(url)).toBe(false);
  });

  it('keeps each photo apart, for a list of cards', () => {
    const photos = usePhotoLoads();
    const other = url.replace('banner', 'poster');
    photos.onLoad(url);
    photos.onError(other);
    expect(photos.shown(url)).toBe(true);
    expect(photos.usable(other)).toBeNull();
  });

  it('has nothing to show for no photo', () => {
    const photos = usePhotoLoads();
    expect(photos.usable(null)).toBeNull();
    expect(photos.shown('')).toBe(false);
  });
});
