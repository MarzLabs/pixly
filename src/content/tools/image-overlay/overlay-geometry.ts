import type { BlendMode, OverlayState } from '@shared/types';
import { BLEND_MODES } from '@shared/types';

/**
 * Pure geometry/state helpers for the image overlay (spec §7). No DOM access, so position math,
 * nudge logic and clamping are unit-testable.
 */

export const MIN_OPACITY = 0;
export const MAX_OPACITY = 1;
export const MIN_SCALE = 0.05;
export const MAX_SCALE = 8;
/** Keyboard nudge step (px) and its modifier (Shift) multiplier (spec §7.3). */
export const NUDGE_STEP_PX = 1;
export const NUDGE_LARGE_STEP_PX = 10;

export function createDefaultOverlayState(): OverlayState {
  return {
    imageKey: null,
    opacity: 0.5,
    blendMode: 'normal',
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    locked: false,
    hidden: false,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampOpacity(value: number): number {
  return clamp(value, MIN_OPACITY, MAX_OPACITY);
}

export function clampScale(value: number): number {
  return clamp(value, MIN_SCALE, MAX_SCALE);
}

export function isBlendMode(value: string): value is BlendMode {
  return (BLEND_MODES as readonly string[]).includes(value);
}

/**
 * CSS transform for the overlay position. The overlay is sized in pixels (see `renderedSize`) instead
 * of via a CSS `scale()`, so the resize handles keep a fixed on-screen size at any scale factor.
 */
export function buildTransform(offsetX: number, offsetY: number): string {
  return `translate(${offsetX}px, ${offsetY}px)`;
}

/** Rendered pixel size of the overlay box for a given natural size and uniform scale factor. */
export function renderedSize(
  naturalWidth: number,
  naturalHeight: number,
  scale: number,
): { width: number; height: number } {
  return { width: naturalWidth * scale, height: naturalHeight * scale };
}

/** Resize handle positions. Only corners are exposed; edges are omitted to preserve aspect ratio. */
export type ResizeCorner = 'nw' | 'ne' | 'sw' | 'se';

export const RESIZE_CORNERS: readonly ResizeCorner[] = ['nw', 'ne', 'sw', 'se'];

/** An overlay transform produced by a resize gesture (committed or previewed). */
export interface OverlayTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface UniformResizeInput {
  corner: ResizeCorner;
  naturalWidth: number;
  naturalHeight: number;
  /** Overlay offset/scale captured at gesture start; they pin the anchor for the whole drag. */
  startOffsetX: number;
  startOffsetY: number;
  startScale: number;
  /** Live pointer position in viewport pixels. */
  pointerX: number;
  pointerY: number;
}

/**
 * Computes the overlay transform while dragging a corner handle (spec §7). The corner opposite the
 * dragged one stays pinned, and the aspect ratio is preserved by projecting the cursor onto the
 * natural-size diagonal, so the design export is never distorted while still tracking the cursor.
 */
export function computeUniformResize(input: UniformResizeInput): OverlayTransform {
  const {
    corner,
    naturalWidth,
    naturalHeight,
    startOffsetX,
    startOffsetY,
    startScale,
    pointerX,
    pointerY,
  } = input;

  const diagonalSquared = naturalWidth * naturalWidth + naturalHeight * naturalHeight;

  if (diagonalSquared === 0) {
    return { scale: startScale, offsetX: startOffsetX, offsetY: startOffsetY };
  }

  const startWidth = naturalWidth * startScale;
  const startHeight = naturalHeight * startScale;
  const left = startOffsetX;
  const top = startOffsetY;
  const right = startOffsetX + startWidth;
  const bottom = startOffsetY + startHeight;

  const movesLeftEdge = corner === 'nw' || corner === 'sw';
  const movesTopEdge = corner === 'nw' || corner === 'ne';
  const anchorX = movesLeftEdge ? right : left;
  const anchorY = movesTopEdge ? bottom : top;

  const candidateWidth = Math.abs(pointerX - anchorX);
  const candidateHeight = Math.abs(pointerY - anchorY);

  const projectedScale =
    (candidateWidth * naturalWidth + candidateHeight * naturalHeight) / diagonalSquared;
  const scale = clampScale(projectedScale);

  const width = naturalWidth * scale;
  const height = naturalHeight * scale;
  const offsetX = movesLeftEdge ? anchorX - width : anchorX;
  const offsetY = movesTopEdge ? anchorY - height : anchorY;

  return { scale, offsetX, offsetY };
}

/** Direction of an arrow-key nudge. */
export type NudgeDirection = 'up' | 'down' | 'left' | 'right';

/** Applies a keyboard nudge to an offset, returning the new {x, y} (spec §7.3). */
export function applyNudge(
  offsetX: number,
  offsetY: number,
  direction: NudgeDirection,
  large: boolean,
): { offsetX: number; offsetY: number } {
  const step = large ? NUDGE_LARGE_STEP_PX : NUDGE_STEP_PX;

  switch (direction) {
    case 'up':
      return { offsetX, offsetY: offsetY - step };
    case 'down':
      return { offsetX, offsetY: offsetY + step };
    case 'left':
      return { offsetX: offsetX - step, offsetY };
    case 'right':
      return { offsetX: offsetX + step, offsetY };
  }
}

/** Maps a KeyboardEvent key to a nudge direction, or null if it is not an arrow key. */
export function arrowKeyToDirection(key: string): NudgeDirection | null {
  switch (key) {
    case 'ArrowUp':
      return 'up';
    case 'ArrowDown':
      return 'down';
    case 'ArrowLeft':
      return 'left';
    case 'ArrowRight':
      return 'right';
    default:
      return null;
  }
}
