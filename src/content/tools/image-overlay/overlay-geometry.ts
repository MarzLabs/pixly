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

/** CSS transform string from the current offset and scale; translate first so scale is anchored. */
export function buildTransform(offsetX: number, offsetY: number, scale: number): string {
  return `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
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
