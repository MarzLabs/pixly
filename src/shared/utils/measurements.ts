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
