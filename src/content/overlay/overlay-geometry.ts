// Pure geometry helpers for ImageOverlayTool's resize, snap, clamp and nudge
// behaviors. Kept side-effect-free so they can be unit tested in isolation
// (no DOM, no chrome.* APIs, no shadow mount).

export const RESIZE_MIN_DIMENSION_PX = 50;
export const RESIZE_MAX_SCALE = 5; // 500% of the natural image size.
export const RESIZE_SNAP_THRESHOLD_RATIO = 0.03; // ±3% around natural size.
export const NUDGE_STEP_PX = 1;
export const NUDGE_LARGE_STEP_PX = 10;
export const MIN_VISIBLE_PX = 50; // Minimum overlay area kept inside viewport.

export type ResizeHandle = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export interface Size {
    width: number;
    height: number;
}

export interface Point {
    x: number;
    y: number;
}

export interface Rect {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface ResizeInput {
    handle: ResizeHandle;
    // The rectangle at the moment the mouse went down.
    startRect: Rect;
    // The current pointer position.
    pointer: Point;
    // Pointer offset captured at mousedown so the handle stays under the cursor.
    pointerOffset: Point;
    naturalSize: Size;
    preserveAspectRatio: boolean;
}

export interface ResizeResult {
    rect: Rect;
    snapped: boolean;
    capped: 'min' | 'max' | null;
}

export interface ViewportSize {
    width: number;
    height: number;
}

// Compute the rectangle while a user drags a corner handle. Preserves aspect
// ratio by default (corner-handle-driven scaling), or resizes freely when
// `preserveAspectRatio` is false (user holds Shift during the drag).
//
// The corner opposite to the active handle is the anchor and never moves.
// Width and height are clamped to RESIZE_MIN_DIMENSION_PX and to the maximum
// scale derived from the natural size. When the scale enters the snap window
// around 100%, both width and height jump to the natural size.
export function computeResize(input: ResizeInput): ResizeResult {
    const { handle, startRect, pointer, pointerOffset, naturalSize, preserveAspectRatio } = input;
    const anchor = oppositeCorner(handle, startRect);
    const targetPointer: Point = {
        x: pointer.x - pointerOffset.x,
        y: pointer.y - pointerOffset.y,
    };

    let proposedWidth = Math.abs(targetPointer.x - anchor.x);
    let proposedHeight = Math.abs(targetPointer.y - anchor.y);

    if (preserveAspectRatio) {
        const aspectRatio = naturalSize.width / naturalSize.height;
        const heightFromWidth = proposedWidth / aspectRatio;
        const widthFromHeight = proposedHeight * aspectRatio;

        // Choose the dominant axis (whichever produced the larger candidate)
        // so the resulting rectangle still encloses the pointer projection.
        if (proposedWidth >= widthFromHeight) {
            proposedHeight = heightFromWidth;
        } else {
            proposedWidth = widthFromHeight;
        }
    }

    const maxWidth = naturalSize.width * RESIZE_MAX_SCALE;
    const maxHeight = naturalSize.height * RESIZE_MAX_SCALE;

    let capped: 'min' | 'max' | null = null;

    if (preserveAspectRatio) {
        const aspectRatio = naturalSize.width / naturalSize.height;
        // Smallest scale that still keeps the shortest side >= the minimum.
        const minScaleFromShortest = aspectRatio >= 1
            ? RESIZE_MIN_DIMENSION_PX / naturalSize.height
            : RESIZE_MIN_DIMENSION_PX / naturalSize.width;
        const minWidth = naturalSize.width * minScaleFromShortest;
        const proposedScale = proposedWidth / naturalSize.width;

        if (proposedScale >= RESIZE_MAX_SCALE) {
            capped = 'max';
            proposedWidth = maxWidth;
            proposedHeight = maxHeight;
        } else if (proposedWidth < minWidth) {
            capped = 'min';
            proposedWidth = minWidth;
            proposedHeight = minWidth / aspectRatio;
        }
    } else {
        if (proposedWidth >= maxWidth || proposedHeight >= maxHeight) {
            capped = 'max';
        } else if (proposedWidth < RESIZE_MIN_DIMENSION_PX || proposedHeight < RESIZE_MIN_DIMENSION_PX) {
            capped = 'min';
        }

        proposedWidth = Math.min(Math.max(proposedWidth, RESIZE_MIN_DIMENSION_PX), maxWidth);
        proposedHeight = Math.min(Math.max(proposedHeight, RESIZE_MIN_DIMENSION_PX), maxHeight);
    }

    // Snap to natural size when the scale lands inside the snap window. Only
    // makes sense when the aspect ratio is preserved (otherwise width and
    // height are independent).
    let snapped = false;

    if (preserveAspectRatio) {
        const scale = proposedWidth / naturalSize.width;

        if (Math.abs(scale - 1) <= RESIZE_SNAP_THRESHOLD_RATIO) {
            proposedWidth = naturalSize.width;
            proposedHeight = naturalSize.height;
            snapped = true;
            capped = null;
        }
    }

    const rect = anchorRect(handle, anchor, proposedWidth, proposedHeight);

    return { rect, snapped, capped };
}

// Return the fixed corner opposite the active handle. The opposite corner
// stays put while the user drags, which is what "anchored resize" means.
export function oppositeCorner(handle: ResizeHandle, rect: Rect): Point {
    switch (handle) {
        case 'top-left':
            return { x: rect.x + rect.width, y: rect.y + rect.height };
        case 'top-right':
            return { x: rect.x, y: rect.y + rect.height };
        case 'bottom-left':
            return { x: rect.x + rect.width, y: rect.y };
        case 'bottom-right':
            return { x: rect.x, y: rect.y };
        default:
            return { x: rect.x, y: rect.y };
    }
}

// Build the final rectangle from the anchor (fixed corner) and the new size,
// placing the active handle on the side derived from the handle id. This is
// the inverse of oppositeCorner.
export function anchorRect(handle: ResizeHandle, anchor: Point, width: number, height: number): Rect {
    switch (handle) {
        case 'top-left':
            return { x: anchor.x - width, y: anchor.y - height, width, height };
        case 'top-right':
            return { x: anchor.x, y: anchor.y - height, width, height };
        case 'bottom-left':
            return { x: anchor.x - width, y: anchor.y, width, height };
        case 'bottom-right':
            return { x: anchor.x, y: anchor.y, width, height };
        default:
            return { x: anchor.x, y: anchor.y, width, height };
    }
}

// Clamp a rectangle so that at least `minVisible` pixels of it remain inside
// the viewport on both axes. Applied after every resize and every nudge so
// the user can't accidentally push the overlay out of reach.
export function clampToViewport(rect: Rect, viewport: ViewportSize, minVisible: number = MIN_VISIBLE_PX): Rect {
    const minVisibleSide = Math.min(minVisible, rect.width, rect.height);
    const minX = -(rect.width - minVisibleSide);
    const maxX = viewport.width - minVisibleSide;
    const minY = -(rect.height - minVisibleSide);
    const maxY = viewport.height - minVisibleSide;

    return {
        x: Math.min(Math.max(rect.x, minX), maxX),
        y: Math.min(Math.max(rect.y, minY), maxY),
        width: rect.width,
        height: rect.height,
    };
}

// Translate a position by the configured nudge step in the given direction.
// `shift` toggles between 1 px (precision) and 10 px (coarse) nudges.
export function nudgePosition(
    position: Point,
    direction: 'up' | 'down' | 'left' | 'right',
    shift: boolean,
): Point {
    const step = shift ? NUDGE_LARGE_STEP_PX : NUDGE_STEP_PX;

    switch (direction) {
        case 'up':
            return { x: position.x, y: position.y - step };
        case 'down':
            return { x: position.x, y: position.y + step };
        case 'left':
            return { x: position.x - step, y: position.y };
        case 'right':
            return { x: position.x + step, y: position.y };
        default:
            return position;
    }
}

// Convert a width to a percentage relative to the natural width, rounded to
// the nearest integer. Used for the popup badge and the resize tooltip.
export function scalePercent(width: number, naturalWidth: number): number {
    if (naturalWidth <= 0) {
        return 0;
    }

    return Math.round((width / naturalWidth) * 100);
}
