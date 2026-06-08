import { describe, expect, it } from 'vitest';
import {
  applyNudge,
  arrowKeyToDirection,
  buildTransform,
  clampOpacity,
  clampScale,
  computeUniformResize,
  createDefaultOverlayState,
  isBlendMode,
  MAX_OPACITY,
  MAX_SCALE,
  MIN_SCALE,
  NUDGE_LARGE_STEP_PX,
  NUDGE_STEP_PX,
  reanchorOffset,
  renderedSize,
} from '@content/tools/image-overlay/overlay-geometry';

describe('overlay geometry', () => {
  it('builds a translate-only transform string (size is applied separately)', () => {
    // Arrange / Act.
    const transform = buildTransform(10, -5);

    // Assert.
    expect(transform).toBe('translate(10px, -5px)');
  });

  it('computes rendered pixel size from natural size and scale', () => {
    // Arrange / Act / Assert.
    expect(renderedSize(200, 100, 1.5)).toEqual({ width: 300, height: 150 });
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
    expect(state.pinnedToViewport).toBe(false);
  });
});

describe('reanchorOffset', () => {
  it('subtracts the scroll position when switching to viewport-pinned', () => {
    // Arrange / Act: a document offset of 1000 while scrolled 800 sits 200px below the viewport top.
    const result = reanchorOffset(40, 1000, 0, 800, true);

    // Assert.
    expect(result).toEqual({ offsetX: 40, offsetY: 200 });
  });

  it('adds the scroll position when switching to document-anchored', () => {
    // Arrange / Act: a viewport offset of 200 while scrolled 800 maps to document offset 1000.
    const result = reanchorOffset(40, 200, 0, 800, false);

    // Assert.
    expect(result).toEqual({ offsetX: 40, offsetY: 1000 });
  });

  it('round-trips back to the original offset', () => {
    // Arrange.
    const scrollX = 120;
    const scrollY = 640;

    // Act: pin then unpin.
    const pinned = reanchorOffset(300, 900, scrollX, scrollY, true);
    const restored = reanchorOffset(pinned.offsetX, pinned.offsetY, scrollX, scrollY, false);

    // Assert.
    expect(restored).toEqual({ offsetX: 300, offsetY: 900 });
  });
});

describe('computeUniformResize', () => {
  const SQUARE = { naturalWidth: 100, naturalHeight: 100 } as const;

  it('grows from the SE corner while pinning the top-left corner', () => {
    // Arrange / Act.
    const result = computeUniformResize({
      corner: 'se',
      ...SQUARE,
      startOffsetX: 0,
      startOffsetY: 0,
      startScale: 1,
      pointerX: 200,
      pointerY: 200,
    });

    // Assert: scale doubles, top-left stays put.
    expect(result).toEqual({ scale: 2, offsetX: 0, offsetY: 0 });
  });

  it('keeps the bottom-right corner pinned when dragging the NW handle', () => {
    // Arrange.
    const startRight = 100;
    const startBottom = 100;

    // Act.
    const result = computeUniformResize({
      corner: 'nw',
      ...SQUARE,
      startOffsetX: 0,
      startOffsetY: 0,
      startScale: 1,
      pointerX: -100,
      pointerY: -100,
    });

    // Assert: the opposite (bottom-right) corner is unchanged.
    expect(result.offsetX + SQUARE.naturalWidth * result.scale).toBe(startRight);
    expect(result.offsetY + SQUARE.naturalHeight * result.scale).toBe(startBottom);
    expect(result.scale).toBe(2);
  });

  it('preserves the aspect ratio of a non-square image', () => {
    // Arrange / Act.
    const result = computeUniformResize({
      corner: 'se',
      naturalWidth: 200,
      naturalHeight: 100,
      startOffsetX: 0,
      startOffsetY: 0,
      startScale: 1,
      pointerX: 400,
      pointerY: 100,
    });

    // Assert: width/height stay at the natural 2:1 ratio (undistorted).
    const width = 200 * result.scale;
    const height = 100 * result.scale;
    expect(width / height).toBe(2);
  });

  it('clamps to the maximum scale on a large drag', () => {
    // Arrange / Act.
    const result = computeUniformResize({
      corner: 'se',
      ...SQUARE,
      startOffsetX: 0,
      startOffsetY: 0,
      startScale: 1,
      pointerX: 10_000,
      pointerY: 10_000,
    });

    // Assert.
    expect(result.scale).toBe(MAX_SCALE);
  });

  it('clamps to the minimum scale when the pointer reaches the anchor', () => {
    // Arrange / Act.
    const result = computeUniformResize({
      corner: 'se',
      ...SQUARE,
      startOffsetX: 0,
      startOffsetY: 0,
      startScale: 1,
      pointerX: 0,
      pointerY: 0,
    });

    // Assert.
    expect(result.scale).toBe(MIN_SCALE);
  });

  it('is a no-op while the natural size is unknown (image not loaded)', () => {
    // Arrange / Act.
    const result = computeUniformResize({
      corner: 'se',
      naturalWidth: 0,
      naturalHeight: 0,
      startOffsetX: 5,
      startOffsetY: 7,
      startScale: 1.5,
      pointerX: 300,
      pointerY: 300,
    });

    // Assert.
    expect(result).toEqual({ scale: 1.5, offsetX: 5, offsetY: 7 });
  });
});
