// Geometry helpers: rectangle-based distance calculations and unit conversion.

const PX_PER_DEFAULT_REM = 16;

export interface Rect {
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
}

export interface Point {
    x: number;
    y: number;
}

export interface RectDistances {
    horizontal: number;
    vertical: number;
    diagonal: number;
    centerDelta: Point;
}

export function rectFromDomRect(rect: DOMRect): Rect {
    return {
        top: rect.top,
        left: rect.left,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
    };
}

export function rectCenter(rect: Rect): Point {
    return {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
    };
}

// Compute axis-aligned distances between the closest edges of two rectangles.
// Returns 0 for axes where the rectangles overlap.
export function rectEdgeDistance(a: Rect, b: Rect): { horizontal: number; vertical: number } {
    const horizontalGap = b.left > a.right
        ? b.left - a.right
        : a.left > b.right
            ? a.left - b.right
            : 0;

    const verticalGap = b.top > a.bottom
        ? b.top - a.bottom
        : a.top > b.bottom
            ? a.top - b.bottom
            : 0;

    return { horizontal: horizontalGap, vertical: verticalGap };
}

export function rectDistances(a: Rect, b: Rect): RectDistances {
    const centerA = rectCenter(a);
    const centerB = rectCenter(b);
    const dx = centerB.x - centerA.x;
    const dy = centerB.y - centerA.y;
    const edge = rectEdgeDistance(a, b);

    return {
        horizontal: edge.horizontal,
        vertical: edge.vertical,
        diagonal: Math.hypot(dx, dy),
        centerDelta: { x: dx, y: dy },
    };
}

// Compute distance from an element edges to its closest sibling/parent edges
// in the four cardinal directions. Returns null per direction when no
// adjacent element is found.
export interface AdjacentDistances {
    top: number | null;
    right: number | null;
    bottom: number | null;
    left: number | null;
}

export function pxToUnit(valuePx: number, unit: 'px' | 'rem' | 'em', basePx = PX_PER_DEFAULT_REM): string {
    if (unit === 'px') {
        return `${Math.round(valuePx)}px`;
    }

    const value = valuePx / basePx;
    const DECIMAL_PRECISION = 2;

    return `${value.toFixed(DECIMAL_PRECISION)}${unit}`;
}

export function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

export interface Viewport {
    width: number;
    height: number;
}

export interface ClippedSegment {
    start: Point;
    end: Point;
    clippedStart: boolean;
    clippedEnd: boolean;
    visibleLength: number;
}

// Clamp an axis-aligned segment (horizontal OR vertical) to the visible
// viewport, shrinking it by `margin` on every side so the geometry never
// touches the very edge of the screen. Returns the clamped endpoints, two
// flags indicating which ends were clipped, and the resulting on-screen
// length. When the original segment is entirely outside the viewport,
// `visibleLength` is 0 and both clipped flags are true.
//
// The function only supports axis-aligned segments because that's the only
// shape Pixly's adjacent-distance lines ever produce. Diagonal clipping
// would require a different algorithm (Cohen–Sutherland or similar).
export function clipSegmentToViewport(
    start: Point,
    end: Point,
    viewport: Viewport,
    margin: number,
): ClippedSegment {
    // Margin-inset bounds used only for visual positioning — keeps the line from
    // touching the very screen edge so the fade-out mask is perceptible.
    const minX = margin;
    const maxX = viewport.width - margin;
    const minY = margin;
    const maxY = viewport.height - margin;

    // Strict viewport bounds used exclusively for the clipped flags. An endpoint
    // that lands inside [0, viewport] is truly on-screen; the clipped flag must
    // only fire when the geometry was cut by the real screen boundary, not merely
    // nudged inward by the cosmetic margin. Using the same margin-inset bounds
    // for both positioning and clipping detection incorrectly marks in-viewport
    // endpoints (e.g. parentRect.top === 0) as "clipped", which hides the
    // arrowhead even though the line starts exactly at the page edge.
    const strictMinX = 0;
    const strictMaxX = viewport.width;
    const strictMinY = 0;
    const strictMaxY = viewport.height;

    const isHorizontal = start.y === end.y;
    const isVertical = start.x === end.x;

    if (!isHorizontal && !isVertical) {
        throw new Error('clipSegmentToViewport only supports axis-aligned segments');
    }

    const originalStartX = start.x;
    const originalStartY = start.y;
    const originalEndX = end.x;
    const originalEndY = end.y;

    const clampedStartX = clamp(originalStartX, minX, maxX);
    const clampedStartY = clamp(originalStartY, minY, maxY);
    const clampedEndX = clamp(originalEndX, minX, maxX);
    const clampedEndY = clamp(originalEndY, minY, maxY);

    const clippedStart = originalStartX < strictMinX || originalStartX > strictMaxX
        || originalStartY < strictMinY || originalStartY > strictMaxY;
    const clippedEnd = originalEndX < strictMinX || originalEndX > strictMaxX
        || originalEndY < strictMinY || originalEndY > strictMaxY;

    const visibleLength = isHorizontal
        ? Math.abs(clampedEndX - clampedStartX)
        : Math.abs(clampedEndY - clampedStartY);

    return {
        start: { x: clampedStartX, y: clampedStartY },
        end: { x: clampedEndX, y: clampedEndY },
        clippedStart,
        clippedEnd,
        visibleLength,
    };
}
