import { describe, expect, it } from 'vitest';
import { BANNER_ASPECT } from '../../../shared/coverPhotos';
import { MAX_ZOOM, cropRect, initialView, panned, zoomed } from './bannerCrop';

const PORTRAIT = { width: 3000, height: 4000 };
const PANORAMA = { width: 6000, height: 1000 };

describe('cropRect', () => {
  it('starts from the widest banner the photo holds, centred', () => {
    expect(cropRect(PORTRAIT, initialView(PORTRAIT))).toEqual({
      x: 0,
      y: 1500,
      width: 3000,
      height: 1000,
    });
    // Wider than a banner: the full height, the middle of the width.
    expect(cropRect(PANORAMA, initialView(PANORAMA))).toEqual({
      x: 1500,
      y: 0,
      width: 3000,
      height: 1000,
    });
  });

  it('always has the banner shape', () => {
    const rect = cropRect(PORTRAIT, { zoom: 2.5, cx: 100, cy: 3900 });
    expect(rect.width / rect.height).toBeCloseTo(BANNER_ASPECT);
  });

  // Empty bands in a banner are worse than any crop.
  it('never leaves the photo, wherever the centre is asked to be', () => {
    for (const view of [
      { zoom: 1, cx: -500, cy: -500 },
      { zoom: 3, cx: 99999, cy: 99999 },
      { zoom: 99, cx: 0, cy: 0 },
    ]) {
      const rect = cropRect(PORTRAIT, view);
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(PORTRAIT.width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(PORTRAIT.height);
    }
  });
});

describe('panned', () => {
  it('moves the frame against the drag, in photo pixels', () => {
    // The 3000px-wide frame shown 600px wide: 5 photo pixels a screen pixel.
    const view = panned(PORTRAIT, initialView(PORTRAIT), 0, 100, 600);
    // Dragged down 100px: the frame rises 500 photo pixels.
    expect(cropRect(PORTRAIT, view).y).toBe(1000);
  });

  it('stops at the edge of the photo', () => {
    const view = panned(PORTRAIT, initialView(PORTRAIT), 0, 5000, 600);
    expect(cropRect(PORTRAIT, view).y).toBe(0);
    // And remembers where it really is, so dragging back responds at once.
    const back = panned(PORTRAIT, view, 0, -10, 600);
    expect(cropRect(PORTRAIT, back).y).toBe(50);
  });
});

describe('zoomed', () => {
  it('narrows the frame around the same centre', () => {
    const rect = cropRect(PORTRAIT, zoomed(PORTRAIT, initialView(PORTRAIT), 2));
    expect(rect).toEqual({ x: 750, y: 1750, width: 1500, height: 500 });
  });

  it('keeps the zoom between whole-photo and the sharpness limit', () => {
    expect(zoomed(PORTRAIT, initialView(PORTRAIT), 0.2).zoom).toBe(1);
    expect(zoomed(PORTRAIT, initialView(PORTRAIT), 50).zoom).toBe(MAX_ZOOM);
  });

  it('zooming out by an edge pulls the frame back inside', () => {
    const atEdge = zoomed(PORTRAIT, { zoom: 4, cx: 100, cy: 3950 }, MAX_ZOOM);
    const out = cropRect(PORTRAIT, zoomed(PORTRAIT, atEdge, 1));
    expect(out.x).toBe(0);
    expect(out.y + out.height).toBe(PORTRAIT.height);
  });
});
