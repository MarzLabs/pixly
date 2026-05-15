// Pure helpers powering the Fix broken images tool. Kept in `shared/` so the
// detection, truncation and minimum-size rules can be unit-tested without
// touching the DOM or pulling in any tool runtime.

import { BROKEN_IMAGES_DEFAULTS } from '../constants/ui';

export type BrokenImageReason = 'natural-zero' | 'error-event' | 'still-loading' | 'loaded';

export interface BrokenImageEvaluation {
    isBroken: boolean;
    reason: BrokenImageReason;
}

export interface ImageProbe {
    complete: boolean;
    naturalWidth: number;
    naturalHeight: number;
    hasErrored: boolean;
    src: string | null;
}

// Treat an <img> as broken when:
// - it finished loading but has zero natural dimensions, OR
// - it fired an `error` event during this session.
// An <img> still loading is reported as `still-loading` so the caller can
// re-evaluate after the load/error event fires.
//
// Per product decision: empty/missing `src` is *not* considered broken — a
// missing `src` is usually a developer placeholder. The caller may layer in a
// stricter rule later if needed.
export function evaluateImage(probe: ImageProbe): BrokenImageEvaluation {
    if (probe.hasErrored) {
        return { isBroken: true, reason: 'error-event' };
    }

    if (!probe.complete) {
        return { isBroken: false, reason: 'still-loading' };
    }

    const hasNoSource = probe.src === null || probe.src.trim().length === 0;

    if (hasNoSource) {
        return { isBroken: false, reason: 'loaded' };
    }

    if (probe.naturalWidth === 0 && probe.naturalHeight === 0) {
        return { isBroken: true, reason: 'natural-zero' };
    }

    return { isBroken: false, reason: 'loaded' };
}

const TRUNCATION_PREFIX = '…';

// Truncate from the start, keeping the trailing characters. Strings shorter
// than the limit are returned untouched. The limit always includes the
// prefix so the visible length is exactly `maxChars`.
export function truncateUrl(url: string, maxChars: number): string {
    if (!Number.isFinite(maxChars) || maxChars <= TRUNCATION_PREFIX.length) {
        return url;
    }

    if (url.length <= maxChars) {
        return url;
    }

    const tailLength = maxChars - TRUNCATION_PREFIX.length;

    return `${TRUNCATION_PREFIX}${url.slice(url.length - tailLength)}`;
}

export function clampUrlMaxChars(value: number): number {
    if (!Number.isFinite(value)) {
        return BROKEN_IMAGES_DEFAULTS.urlMaxChars;
    }

    const lower = Math.max(BROKEN_IMAGES_DEFAULTS.minUrlChars, Math.floor(value));

    return Math.min(BROKEN_IMAGES_DEFAULTS.maxUrlChars, lower);
}

export interface PlaceholderSize {
    width: number;
    height: number;
    showLabel: boolean;
}

// Decide the rendered size of the placeholder. The image's rendered geometry
// (its bounding rect) is the source of truth. We never *enlarge* the
// placeholder when the image already has a positive size — doing so would
// alter the page layout, which the spec forbids. The minimum size only kicks
// in for true 0×0 images that have no width/height set at all.
export function decidePlaceholderSize(
    renderedWidth: number,
    renderedHeight: number,
    minPx: number = BROKEN_IMAGES_DEFAULTS.minPlaceholderPx,
    minLabelPx: number = BROKEN_IMAGES_DEFAULTS.minLabelPx,
): PlaceholderSize {
    const width = Math.max(renderedWidth, renderedWidth === 0 ? minPx : 0);
    const height = Math.max(renderedHeight, renderedHeight === 0 ? minPx : 0);
    const showLabel = width >= minLabelPx && height >= minLabelPx;

    return {
        width: Math.round(width),
        height: Math.round(height),
        showLabel,
    };
}
