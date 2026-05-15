import { describe, expect, it } from 'vitest';
import {
    anchorRect,
    clampToViewport,
    computeResize,
    MIN_VISIBLE_PX,
    NUDGE_LARGE_STEP_PX,
    NUDGE_STEP_PX,
    nudgePosition,
    oppositeCorner,
    RESIZE_MAX_SCALE,
    RESIZE_MIN_DIMENSION_PX,
    scalePercent,
    type Rect,
    type ResizeInput,
} from './overlay-geometry';

const ZERO_OFFSET = { x: 0, y: 0 };
const NATURAL_LANDSCAPE = { width: 1000, height: 500 };
const NATURAL_PORTRAIT = { width: 500, height: 1000 };

function makeRect(x: number, y: number, width: number, height: number): Rect {
    return { x, y, width, height };
}

describe('oppositeCorner', () => {
    const rect = makeRect(100, 200, 300, 150);

    it('returns the bottom-right corner when dragging the top-left handle', () => {
        // Act
        const corner = oppositeCorner('top-left', rect);

        // Assert
        expect(corner).toEqual({ x: 400, y: 350 });
    });

    it('returns the bottom-left corner when dragging the top-right handle', () => {
        // Act
        const corner = oppositeCorner('top-right', rect);

        // Assert
        expect(corner).toEqual({ x: 100, y: 350 });
    });

    it('returns the top-right corner when dragging the bottom-left handle', () => {
        // Act
        const corner = oppositeCorner('bottom-left', rect);

        // Assert
        expect(corner).toEqual({ x: 400, y: 200 });
    });

    it('returns the top-left corner when dragging the bottom-right handle', () => {
        // Act
        const corner = oppositeCorner('bottom-right', rect);

        // Assert
        expect(corner).toEqual({ x: 100, y: 200 });
    });
});

describe('anchorRect', () => {
    it('places a top-left-handle rectangle above and left of the anchor', () => {
        // Act
        const rect = anchorRect('top-left', { x: 400, y: 350 }, 300, 150);

        // Assert
        expect(rect).toEqual({ x: 100, y: 200, width: 300, height: 150 });
    });

    it('places a bottom-right-handle rectangle below and right of the anchor', () => {
        // Act
        const rect = anchorRect('bottom-right', { x: 100, y: 200 }, 300, 150);

        // Assert
        expect(rect).toEqual({ x: 100, y: 200, width: 300, height: 150 });
    });
});

describe('computeResize (aspect ratio preserved)', () => {
    const baseInput: Omit<ResizeInput, 'handle' | 'pointer'> = {
        startRect: makeRect(100, 100, 1000, 500),
        pointerOffset: ZERO_OFFSET,
        naturalSize: NATURAL_LANDSCAPE,
        preserveAspectRatio: true,
    };

    it('keeps the opposite corner fixed when dragging the bottom-right handle', () => {
        // Arrange — shrink the rectangle by dragging inward.
        const input: ResizeInput = {
            ...baseInput,
            handle: 'bottom-right',
            pointer: { x: 700, y: 300 },
        };

        // Act
        const result = computeResize(input);

        // Assert — top-left anchor (100, 100) is preserved.
        expect(result.rect.x).toBe(100);
        expect(result.rect.y).toBe(100);
    });

    it('produces no initial size jump when pointerOffset captures the click inside the handle', () => {
        // Arrange — overlay at (300, 200) with size (400, 300). The bottom-right
        // handle is offset 6 px outside the container, so the user clicked 6 px
        // INSIDE the container right edge (at clientX=694 instead of 700).
        // pointerOffset = { x: 694 - 700, y: 494 - 500 } = { x: -6, y: -6 }.
        const CLICK_INSIDE_OFFSET_PX = 6;
        const startRect = makeRect(300, 200, 400, 300);
        const handleCornerX = startRect.x + startRect.width;
        const handleCornerY = startRect.y + startRect.height;
        const clickX = handleCornerX - CLICK_INSIDE_OFFSET_PX;
        const clickY = handleCornerY - CLICK_INSIDE_OFFSET_PX;

        const input: ResizeInput = {
            handle: 'bottom-right',
            startRect,
            pointer: { x: clickX, y: clickY },
            pointerOffset: { x: clickX - handleCornerX, y: clickY - handleCornerY },
            naturalSize: { width: 400, height: 300 },
            preserveAspectRatio: true,
        };

        // Act
        const result = computeResize(input);

        // Assert — width and height remain at their initial values; no jump.
        expect(result.rect.width).toBe(startRect.width);
        expect(result.rect.height).toBe(startRect.height);
        expect(result.rect.x).toBe(startRect.x);
        expect(result.rect.y).toBe(startRect.y);
    });

    it('preserves the aspect ratio within sub-pixel tolerance', () => {
        // Arrange
        const input: ResizeInput = {
            ...baseInput,
            handle: 'bottom-right',
            pointer: { x: 700, y: 250 },
        };

        // Act
        const result = computeResize(input);
        const ratio = result.rect.width / result.rect.height;

        // Assert
        expect(Math.abs(ratio - 2)).toBeLessThan(0.001);
    });

    it('snaps to the natural size when scale lands inside the snap window', () => {
        // Arrange — push the pointer so the resulting width sits at ~99% of natural.
        // Natural is 1000 wide; anchor is at (100, 100); aim for 990 width.
        const input: ResizeInput = {
            ...baseInput,
            handle: 'bottom-right',
            pointer: { x: 100 + 990, y: 100 + 495 },
        };

        // Act
        const result = computeResize(input);

        // Assert — snapped exactly to natural size.
        expect(result.snapped).toBe(true);
        expect(result.rect.width).toBe(NATURAL_LANDSCAPE.width);
        expect(result.rect.height).toBe(NATURAL_LANDSCAPE.height);
    });

    it('clamps to the maximum scale (500%) when dragged past it', () => {
        // Arrange — pointer far outside the natural * 5 box.
        const input: ResizeInput = {
            ...baseInput,
            handle: 'bottom-right',
            pointer: { x: 100 + 10000, y: 100 + 5000 },
        };

        // Act
        const result = computeResize(input);

        // Assert
        expect(result.capped).toBe('max');
        expect(result.rect.width).toBe(NATURAL_LANDSCAPE.width * RESIZE_MAX_SCALE);
        expect(result.rect.height).toBe(NATURAL_LANDSCAPE.height * RESIZE_MAX_SCALE);
    });

    it('clamps so the shortest side stays at the minimum dimension', () => {
        // Arrange — drag well inside the minimum.
        const input: ResizeInput = {
            ...baseInput,
            handle: 'bottom-right',
            pointer: { x: 110, y: 110 },
        };

        // Act
        const result = computeResize(input);

        // Assert — landscape image, so the shortest side is the height.
        expect(result.capped).toBe('min');
        expect(result.rect.height).toBe(RESIZE_MIN_DIMENSION_PX);
        expect(result.rect.width).toBe(RESIZE_MIN_DIMENSION_PX * 2);
    });

    it('uses the width as the shortest side when the image is portrait', () => {
        // Arrange
        const input: ResizeInput = {
            ...baseInput,
            naturalSize: NATURAL_PORTRAIT,
            startRect: makeRect(0, 0, 500, 1000),
            handle: 'bottom-right',
            pointer: { x: 10, y: 10 },
        };

        // Act
        const result = computeResize(input);

        // Assert
        expect(result.capped).toBe('min');
        expect(result.rect.width).toBe(RESIZE_MIN_DIMENSION_PX);
        expect(result.rect.height).toBe(RESIZE_MIN_DIMENSION_PX * 2);
    });
});

describe('computeResize (free aspect — Shift held)', () => {
    it('updates width and height independently of the natural ratio', () => {
        // Arrange — drag bottom-right to a non-proportional point.
        const input: ResizeInput = {
            handle: 'bottom-right',
            startRect: makeRect(0, 0, 1000, 500),
            pointer: { x: 800, y: 600 },
            pointerOffset: ZERO_OFFSET,
            naturalSize: NATURAL_LANDSCAPE,
            preserveAspectRatio: false,
        };

        // Act
        const result = computeResize(input);

        // Assert
        expect(result.rect.width).toBe(800);
        expect(result.rect.height).toBe(600);
        expect(result.snapped).toBe(false);
    });

    it('never snaps to 100% when aspect ratio is free', () => {
        // Arrange — width near natural but height not.
        const input: ResizeInput = {
            handle: 'bottom-right',
            startRect: makeRect(0, 0, 1000, 500),
            pointer: { x: 995, y: 300 },
            pointerOffset: ZERO_OFFSET,
            naturalSize: NATURAL_LANDSCAPE,
            preserveAspectRatio: false,
        };

        // Act
        const result = computeResize(input);

        // Assert
        expect(result.snapped).toBe(false);
        expect(result.rect.width).toBe(995);
        expect(result.rect.height).toBe(300);
    });

    it('reports capped=min when either dimension falls below the minimum', () => {
        // Arrange
        const input: ResizeInput = {
            handle: 'bottom-right',
            startRect: makeRect(0, 0, 1000, 500),
            pointer: { x: 10, y: 10 },
            pointerOffset: ZERO_OFFSET,
            naturalSize: NATURAL_LANDSCAPE,
            preserveAspectRatio: false,
        };

        // Act
        const result = computeResize(input);

        // Assert
        expect(result.capped).toBe('min');
        expect(result.rect.width).toBe(RESIZE_MIN_DIMENSION_PX);
        expect(result.rect.height).toBe(RESIZE_MIN_DIMENSION_PX);
    });
});

describe('clampToViewport', () => {
    const viewport = { width: 1024, height: 768 };

    it('returns the same rectangle when fully visible', () => {
        // Arrange
        const rect = makeRect(100, 100, 400, 200);

        // Act
        const clamped = clampToViewport(rect, viewport);

        // Assert
        expect(clamped).toEqual(rect);
    });

    it('keeps at least MIN_VISIBLE_PX visible when pushed off the right edge', () => {
        // Arrange — most of the rectangle to the right of the viewport.
        const rect = makeRect(2000, 100, 400, 200);

        // Act
        const clamped = clampToViewport(rect, viewport);

        // Assert — at least 50 px of the rectangle remains inside.
        expect(clamped.x).toBeLessThanOrEqual(viewport.width - MIN_VISIBLE_PX);
        expect(clamped.x + clamped.width).toBeGreaterThanOrEqual(MIN_VISIBLE_PX);
    });

    it('keeps at least MIN_VISIBLE_PX visible when pushed off the top edge', () => {
        // Arrange
        const rect = makeRect(100, -1000, 400, 200);

        // Act
        const clamped = clampToViewport(rect, viewport);

        // Assert
        expect(clamped.y + clamped.height).toBeGreaterThanOrEqual(MIN_VISIBLE_PX);
    });

    it('keeps at least MIN_VISIBLE_PX visible when pushed off the left edge', () => {
        // Arrange
        const rect = makeRect(-2000, 100, 400, 200);

        // Act
        const clamped = clampToViewport(rect, viewport);

        // Assert
        expect(clamped.x + clamped.width).toBeGreaterThanOrEqual(MIN_VISIBLE_PX);
    });
});

// Regression tests: anchor preservation when clampToViewport fires during resize.
//
// The tool adjusts width/height by the same delta that clampToViewport applied
// to x/y so that the anchor (opposite corner of the active handle) does not
// visually jump. These tests verify the geometry that the tool relies on.
describe('anchor preservation when clampToViewport shifts position', () => {
    it('top-left drag: clamped x delta correctly reduces width to keep anchor fixed', () => {
        // Arrange — image at (0, 0), size (1000, 500). User drags top-left
        // far beyond the left edge so computeResize returns a very negative x.
        const startRect = makeRect(0, 0, 1000, 500);
        const anchorBottomRight = {
            x: startRect.x + startRect.width,  // 1000
            y: startRect.y + startRect.height, // 500
        };
        const input: ResizeInput = {
            handle: 'top-left',
            startRect,
            pointer: { x: -600, y: -300 },
            pointerOffset: ZERO_OFFSET,
            naturalSize: NATURAL_LANDSCAPE,
            preserveAspectRatio: false,
        };
        const viewport = { width: 1024, height: 768 };

        // Act
        const result = computeResize(input);
        const clamped = clampToViewport(result.rect, viewport);
        const dx = clamped.x - result.rect.x;
        const dy = clamped.y - result.rect.y;
        const anchoredWidth = Math.max(result.rect.width - dx, RESIZE_MIN_DIMENSION_PX);
        const anchoredHeight = Math.max(result.rect.height - dy, RESIZE_MIN_DIMENSION_PX);

        // Assert — the anchor (bottom-right corner) stays at its geometric position
        // despite the clamp shifting the container leftward.
        expect(clamped.x + anchoredWidth).toBe(anchorBottomRight.x);
        expect(clamped.y + anchoredHeight).toBe(anchorBottomRight.y);
    });

    it('bottom-left drag: clamped x delta correctly reduces width to keep anchor fixed', () => {
        // Arrange — image at (200, 100), size (800, 400). User drags bottom-left
        // far left so the rect's x becomes very negative.
        const startRect = makeRect(200, 100, 800, 400);
        const anchorTopRight = {
            x: startRect.x + startRect.width, // 1000
            y: startRect.y,                   // 100
        };
        const input: ResizeInput = {
            handle: 'bottom-left',
            startRect,
            pointer: { x: -500, y: 600 },
            pointerOffset: ZERO_OFFSET,
            naturalSize: NATURAL_LANDSCAPE,
            preserveAspectRatio: false,
        };
        const viewport = { width: 1024, height: 768 };

        // Act
        const result = computeResize(input);
        const clamped = clampToViewport(result.rect, viewport);
        const dx = clamped.x - result.rect.x;
        const anchoredWidth = Math.max(result.rect.width - dx, RESIZE_MIN_DIMENSION_PX);

        // Assert — the right edge (anchor x) is preserved.
        expect(clamped.x + anchoredWidth).toBe(anchorTopRight.x);
    });

    it('top-right drag growing upward: clamped y delta reduces height to keep anchor fixed', () => {
        // Arrange — image at (100, 100), size (600, 400). User drags top-right
        // far upward so the rect's y becomes very negative.
        const startRect = makeRect(100, 100, 600, 400);
        const anchorBottomLeft = {
            x: startRect.x,                    // 100
            y: startRect.y + startRect.height, // 500
        };
        const input: ResizeInput = {
            handle: 'top-right',
            startRect,
            pointer: { x: 700, y: -500 },
            pointerOffset: ZERO_OFFSET,
            naturalSize: NATURAL_LANDSCAPE,
            preserveAspectRatio: false,
        };
        const viewport = { width: 1024, height: 768 };

        // Act
        const result = computeResize(input);
        const clamped = clampToViewport(result.rect, viewport);
        const dy = clamped.y - result.rect.y;
        const anchoredHeight = Math.max(result.rect.height - dy, RESIZE_MIN_DIMENSION_PX);

        // Assert — the bottom edge (anchor y) is preserved.
        expect(clamped.y + anchoredHeight).toBe(anchorBottomLeft.y);
    });

    it('bottom-right drag: clamp does not affect x or y when anchor is at origin', () => {
        // Arrange — image at (0, 0), bottom-right drag. The anchor (top-left)
        // is at the origin, which is always within viewport bounds, so
        // clampToViewport must not change x or y.
        const startRect = makeRect(0, 0, 1000, 500);
        const input: ResizeInput = {
            handle: 'bottom-right',
            startRect,
            pointer: { x: 10000, y: 5000 },
            pointerOffset: ZERO_OFFSET,
            naturalSize: NATURAL_LANDSCAPE,
            preserveAspectRatio: true,
        };
        const viewport = { width: 1024, height: 768 };

        // Act
        const result = computeResize(input);
        const clamped = clampToViewport(result.rect, viewport);
        const dx = clamped.x - result.rect.x;
        const dy = clamped.y - result.rect.y;

        // Assert — no positional shift; anchor correction is a no-op (dx=0, dy=0).
        expect(dx).toBe(0);
        expect(dy).toBe(0);
    });
});

describe('nudgePosition', () => {
    const start = { x: 100, y: 200 };

    it('moves 1 px per arrow when shift is not held', () => {
        // Act
        const right = nudgePosition(start, 'right', false);
        const left = nudgePosition(start, 'left', false);
        const up = nudgePosition(start, 'up', false);
        const down = nudgePosition(start, 'down', false);

        // Assert
        expect(right).toEqual({ x: start.x + NUDGE_STEP_PX, y: start.y });
        expect(left).toEqual({ x: start.x - NUDGE_STEP_PX, y: start.y });
        expect(up).toEqual({ x: start.x, y: start.y - NUDGE_STEP_PX });
        expect(down).toEqual({ x: start.x, y: start.y + NUDGE_STEP_PX });
    });

    it('moves 10 px per arrow when shift is held', () => {
        // Act
        const right = nudgePosition(start, 'right', true);
        const down = nudgePosition(start, 'down', true);

        // Assert
        expect(right).toEqual({ x: start.x + NUDGE_LARGE_STEP_PX, y: start.y });
        expect(down).toEqual({ x: start.x, y: start.y + NUDGE_LARGE_STEP_PX });
    });
});

describe('scalePercent', () => {
    it('returns 100 when width matches natural width', () => {
        expect(scalePercent(1000, 1000)).toBe(100);
    });

    it('rounds to the nearest integer', () => {
        expect(scalePercent(891, 1000)).toBe(89);
        expect(scalePercent(896, 1000)).toBe(90);
    });

    it('returns 0 when natural width is zero (avoids division by zero)', () => {
        expect(scalePercent(500, 0)).toBe(0);
    });
});
