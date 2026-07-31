import { clamp } from '@shared/lib/math';

/**
 * Pure planning math for full-page (scroll & stitch) captures. captureVisibleTab only ever sees
 * the viewport, so a long page is photographed as a sequence of viewport slices at increasing
 * scroll offsets and stitched into one tall bitmap. No DOM access, so the plan is unit-testable.
 */

/**
 * Hard ceiling for the stitched bitmap's height in device pixels. Chrome's 2D canvas tops out
 * around 16384px per side on common GPUs — beyond it drawing fails silently. Pages taller than
 * the cap are truncated (and the tool says so) rather than failing the whole capture.
 */
export const MAX_STITCH_DEVICE_HEIGHT_PX = 16384;

export interface ScrollCapturePlan {
  /**
   * Scroll offsets to visit, in CSS pixels, ascending. The final offset is clamped so the last
   * slice sits flush with the capture bottom (it overlaps the previous slice instead of
   * overshooting — the page cannot scroll past its end anyway).
   */
  scrollTops: number[];
  /** CSS-pixel height of the stitched capture: the page height, or the cap when truncated. */
  totalCssHeight: number;
  /** True when the page is taller than the device-pixel cap allows. */
  truncated: boolean;
}

export function planScrollCapture(
  viewportHeightCss: number,
  pageHeightCss: number,
  dpr: number,
  maxDeviceHeightPx: number = MAX_STITCH_DEVICE_HEIGHT_PX,
): ScrollCapturePlan {
  const viewport = Math.max(1, Math.floor(viewportHeightCss));
  const scale = dpr > 0 ? dpr : 1;
  // A page shorter than the viewport still yields a viewport-tall capture: the slice PNG spans
  // the full viewport and there is nothing to crop it against.
  const capCss = Math.max(viewport, Math.floor(maxDeviceHeightPx / scale));
  const page = Math.max(viewport, Math.floor(pageHeightCss));
  const totalCssHeight = Math.min(page, capCss);
  const truncated = page > capCss;

  const maxScrollTop = totalCssHeight - viewport;
  const scrollTops = [0];

  for (let top = viewport; top < maxScrollTop; top += viewport) {
    scrollTops.push(top);
  }

  if (maxScrollTop > 0) {
    scrollTops.push(maxScrollTop);
  }

  return { scrollTops, totalCssHeight, truncated };
}

/**
 * Vertical device-pixel placement of a slice inside the stitched canvas, computed from the
 * scroll offset the page ACTUALLY reached (the browser may clamp or adjust the requested one).
 * Clamped so the slice never paints past the canvas bottom.
 */
export function sliceDeviceOffsetY(
  achievedScrollTopCss: number,
  deviceScale: number,
  sliceDeviceHeight: number,
  stitchDeviceHeight: number,
): number {
  const scale = deviceScale > 0 ? deviceScale : 1;

  return clamp(
    Math.round(achievedScrollTopCss * scale),
    0,
    Math.max(0, stitchDeviceHeight - sliceDeviceHeight),
  );
}
