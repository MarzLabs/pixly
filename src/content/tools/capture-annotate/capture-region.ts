import { clamp } from '@shared/lib/math';

/**
 * Pure region math for scoped captures (area / element). captureVisibleTab always returns the
 * FULL viewport PNG, so scoping a capture means selecting a viewport rect in CSS pixels and
 * cropping the bitmap in device pixels. No DOM access, so the mapping is unit-testable.
 */

/** Viewport-relative rect in CSS pixels. */
export interface CaptureRegion {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * A running picker overlay (area marquee or element highlight). `result` resolves with the
 * selection, or null on cancel; `cancel()` lets the owner tear the overlay down externally
 * (e.g. the tool deactivating mid-pick) — it resolves `result` with null.
 */
export interface RegionPick {
  result: Promise<CaptureRegion | null>;
  cancel(): void;
}

/** Selections smaller than this on either side are noise (a slipped click), not a capture. */
export const MIN_REGION_SIZE_PX = 8;

export function isViableRegion(region: CaptureRegion): boolean {
  return region.width >= MIN_REGION_SIZE_PX && region.height >= MIN_REGION_SIZE_PX;
}

/** Clips a region to the viewport; element rects routinely overflow it (tall sections, etc.). */
export function clampRegionToViewport(
  region: CaptureRegion,
  viewportWidth: number,
  viewportHeight: number,
): CaptureRegion {
  const left = clamp(region.left, 0, viewportWidth);
  const top = clamp(region.top, 0, viewportHeight);
  const right = clamp(region.left + region.width, 0, viewportWidth);
  const bottom = clamp(region.top + region.height, 0, viewportHeight);

  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

/** Source-crop arguments for createImageBitmap, in capture-bitmap device pixels. */
export interface DeviceCrop {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/**
 * Maps a CSS-pixel viewport region onto the capture bitmap, clamped to its real dimensions
 * (the PNG spans the full viewport at devicePixelRatio scale). Returns null when the region
 * falls entirely outside the bitmap — callers keep the uncropped capture in that case.
 */
export function regionToDeviceCrop(
  region: CaptureRegion,
  dpr: number,
  bitmapWidth: number,
  bitmapHeight: number,
): DeviceCrop | null {
  const scale = dpr > 0 ? dpr : 1;
  const sx = clamp(Math.round(region.left * scale), 0, bitmapWidth);
  const sy = clamp(Math.round(region.top * scale), 0, bitmapHeight);
  const sw = clamp(Math.round(region.width * scale), 0, bitmapWidth - sx);
  const sh = clamp(Math.round(region.height * scale), 0, bitmapHeight - sy);

  return sw > 0 && sh > 0 ? { sx, sy, sw, sh } : null;
}
