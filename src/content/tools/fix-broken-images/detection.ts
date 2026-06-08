/**
 * Pure broken-image detection logic (spec §6.2). Kept free of side effects and DOM mutation so it
 * is unit-testable in happy-dom and reusable by the observer pipeline.
 */

/** Default minimum rendered size (px) below which an image is ignored (tracking pixels, spacers). */
export const DEFAULT_MIN_SIZE_PX = 8;

/** Minimal view of an <img> needed to decide if it is broken. Lets tests avoid real elements. */
export interface ImageProbe {
  complete: boolean;
  naturalWidth: number;
  naturalHeight: number;
  /** True when the element fired an `error` event since the tool started observing. */
  erroredOnLoad: boolean;
  /** Current rendered box size in CSS pixels (from getBoundingClientRect). */
  renderedWidth: number;
  renderedHeight: number;
  /** The src that was attempted; empty string means nothing to load. */
  currentSrc: string;
}

/**
 * Classifies an image. An image is considered broken when it has a real source that either fired
 * an error, or finished loading with zero natural dimensions (the classic broken-image case).
 *
 * Images that have not finished loading yet (lazy/in-flight) are reported as `pending` and must be
 * re-checked on their load/error events rather than being marked broken prematurely (spec §6.2).
 */
export type ImageStatus = 'broken' | 'ok' | 'pending' | 'ignored';

export function classifyImage(probe: ImageProbe, minSizePx: number): ImageStatus {
  const hasSource = probe.currentSrc.trim().length > 0;

  if (!hasSource) {
    // No source to load — there is nothing to "fix"; treat as not-broken.
    return 'ok';
  }

  // Hidden / collapsed images (0 box) do not occupy layout, so a placeholder adds nothing.
  const hasNoRenderedBox = probe.renderedWidth === 0 && probe.renderedHeight === 0;

  if (hasNoRenderedBox && probe.complete) {
    return 'ignored';
  }

  if (probe.erroredOnLoad) {
    return classifyBySize(probe, minSizePx);
  }

  if (!probe.complete) {
    return 'pending';
  }

  const loadedButEmpty = probe.naturalWidth === 0 && probe.naturalHeight === 0;

  if (loadedButEmpty) {
    return classifyBySize(probe, minSizePx);
  }

  return 'ok';
}

function classifyBySize(probe: ImageProbe, minSizePx: number): ImageStatus {
  const tooSmall = probe.renderedWidth < minSizePx && probe.renderedHeight < minSizePx;

  return tooSmall ? 'ignored' : 'broken';
}

/** Convenience predicate for the observer pipeline. */
export function isBroken(probe: ImageProbe, minSizePx: number): boolean {
  return classifyImage(probe, minSizePx) === 'broken';
}
