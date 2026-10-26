import { BANNER_ASPECT } from '../../../shared/coverPhotos';

/**
 * Choosing the part of a photo the banner shows: the geometry behind the crop
 * modal, in the photo's own pixels.
 *
 * The frame has the banner's shape ({@link BANNER_ASPECT}). At zoom 1 it is the
 * largest such frame the photo holds; zooming in narrows it around its centre,
 * and dragging moves that centre. Every view is clamped so the frame never
 * leaves the photo: a banner with empty bands would be worse than any crop.
 */

/** A region of the photo, in its own pixels. */
export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Where the frame is: how far zoomed in, and the photo point at its centre. */
export interface CropView {
  zoom: number;
  cx: number;
  cy: number;
}

/** Further in than this and a typical phone photo stops looking sharp. */
export const MAX_ZOOM = 4;

interface Size {
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** The largest frame of the banner's shape that fits in the photo. */
function fullFrame(photo: Size): Size {
  return photo.width / photo.height > BANNER_ASPECT
    ? { width: photo.height * BANNER_ASPECT, height: photo.height }
    : { width: photo.width, height: photo.width / BANNER_ASPECT };
}

/** The region `view` frames, held inside the photo. */
export function cropRect(photo: Size, view: CropView): CropRect {
  const full = fullFrame(photo);
  const zoom = clamp(view.zoom, 1, MAX_ZOOM);
  const width = full.width / zoom;
  const height = full.height / zoom;
  return {
    x: clamp(view.cx - width / 2, 0, photo.width - width),
    y: clamp(view.cy - height / 2, 0, photo.height - height),
    width,
    height,
  };
}

/** `view` with its centre where the clamped frame really is. */
function settled(photo: Size, view: CropView): CropView {
  const rect = cropRect(photo, view);
  return {
    zoom: clamp(view.zoom, 1, MAX_ZOOM),
    cx: rect.x + rect.width / 2,
    cy: rect.y + rect.height / 2,
  };
}

/** The whole width (or height) of the photo, centred: what a host starts from. */
export function initialView(photo: Size): CropView {
  return { zoom: 1, cx: photo.width / 2, cy: photo.height / 2 };
}

/**
 * The view after the photo is dragged by `dx`, `dy` screen pixels in a frame
 * `frameWidth` pixels wide. Dragging the photo right brings its left into the
 * frame, so the centre moves the other way.
 */
export function panned(
  photo: Size,
  view: CropView,
  dx: number,
  dy: number,
  frameWidth: number,
): CropView {
  const rect = cropRect(photo, view);
  const perScreenPixel = rect.width / Math.max(frameWidth, 1);
  return settled(photo, {
    zoom: view.zoom,
    cx: rect.x + rect.width / 2 - dx * perScreenPixel,
    cy: rect.y + rect.height / 2 - dy * perScreenPixel,
  });
}

/** The view zoomed to `zoom`, around the same centre as far as the photo allows. */
export function zoomed(photo: Size, view: CropView, zoom: number): CropView {
  const rect = cropRect(photo, view);
  return settled(photo, {
    zoom,
    cx: rect.x + rect.width / 2,
    cy: rect.y + rect.height / 2,
  });
}
