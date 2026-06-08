import { describe, expect, it } from 'vitest';
import {
  applyNudge,
  arrowKeyToDirection,
  buildTransform,
  clampOpacity,
  clampScale,
  createDefaultOverlayState,
  isBlendMode,
  MAX_OPACITY,
  MAX_SCALE,
  MIN_SCALE,
  NUDGE_LARGE_STEP_PX,
  NUDGE_STEP_PX,
} from '@content/tools/image-overlay/overlay-geometry';

describe('overlay geometry', () => {
  it('builds a translate-then-scale transform string', () => {
    // Arrange / Act.
    const transform = buildTransform(10, -5, 2);

    // Assert.
    expect(transform).toBe('translate(10px, -5px) scale(2)');
  });

  it('clamps opacity into the 0..1 range', () => {
    // Arrange / Act / Assert.
    expect(clampOpacity(1.4)).toBe(MAX_OPACITY);
    expect(clampOpacity(-0.2)).toBe(0);
    expect(clampOpacity(0.5)).toBe(0.5);
  });

  it('clamps scale into the allowed factor range', () => {
    // Arrange / Act / Assert.
    expect(clampScale(99)).toBe(MAX_SCALE);
    expect(clampScale(0)).toBe(MIN_SCALE);
  });

  it('nudges by one pixel with arrow keys', () => {
    // Arrange / Act.
    const result = applyNudge(0, 0, 'right', false);

    // Assert.
    expect(result).toEqual({ offsetX: NUDGE_STEP_PX, offsetY: 0 });
  });

  it('nudges by the coarse step when the modifier is held', () => {
    // Arrange / Act.
    const result = applyNudge(100, 100, 'up', true);

    // Assert.
    expect(result).toEqual({ offsetX: 100, offsetY: 100 - NUDGE_LARGE_STEP_PX });
  });

  it('maps arrow keys to directions and ignores other keys', () => {
    // Arrange / Act / Assert.
    expect(arrowKeyToDirection('ArrowLeft')).toBe('left');
    expect(arrowKeyToDirection('ArrowDown')).toBe('down');
    expect(arrowKeyToDirection('Enter')).toBeNull();
  });

  it('recognizes difference as a valid blend mode (pixel-perfect comparison)', () => {
    // Arrange / Act / Assert.
    expect(isBlendMode('difference')).toBe(true);
    expect(isBlendMode('not-a-mode')).toBe(false);
  });

  it('starts at 50% opacity, normal blend, top-left origin', () => {
    // Arrange / Act.
    const state = createDefaultOverlayState();

    // Assert.
    expect(state.opacity).toBe(0.5);
    expect(state.blendMode).toBe('normal');
    expect(state.offsetX).toBe(0);
    expect(state.offsetY).toBe(0);
    expect(state.locked).toBe(false);
  });
});
