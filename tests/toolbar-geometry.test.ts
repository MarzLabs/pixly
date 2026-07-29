import { describe, expect, it } from 'vitest';
import {
  clampToViewport,
  DRAG_ACTIVATION_THRESHOLD_PX,
  isDragGesture,
  WIDGET_MARGIN_PX,
} from '@content/ui/toolbar-geometry';

const VIEWPORT_WIDTH = 1280;
const VIEWPORT_HEIGHT = 800;
const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 400;

describe('toolbar widget clamping', () => {
  it('keeps an in-bounds position untouched', () => {
    // Arrange / Act.
    const result = clampToViewport(
      { x: 100, y: 100 },
      PANEL_WIDTH,
      PANEL_HEIGHT,
      VIEWPORT_WIDTH,
      VIEWPORT_HEIGHT,
    );

    // Assert.
    expect(result).toEqual({ x: 100, y: 100 });
  });

  it('pulls a position back inside the right/bottom edges (panel expanded near a corner)', () => {
    // Arrange / Act: a pill dragged to the bottom-right corner, then expanded into a panel.
    const result = clampToViewport(
      { x: VIEWPORT_WIDTH - 10, y: VIEWPORT_HEIGHT - 10 },
      PANEL_WIDTH,
      PANEL_HEIGHT,
      VIEWPORT_WIDTH,
      VIEWPORT_HEIGHT,
    );

    // Assert.
    expect(result).toEqual({
      x: VIEWPORT_WIDTH - PANEL_WIDTH - WIDGET_MARGIN_PX,
      y: VIEWPORT_HEIGHT - PANEL_HEIGHT - WIDGET_MARGIN_PX,
    });
  });

  it('honors the edge margin on the top/left edges', () => {
    // Arrange / Act.
    const result = clampToViewport(
      { x: -50, y: -50 },
      PANEL_WIDTH,
      PANEL_HEIGHT,
      VIEWPORT_WIDTH,
      VIEWPORT_HEIGHT,
    );

    // Assert.
    expect(result).toEqual({ x: WIDGET_MARGIN_PX, y: WIDGET_MARGIN_PX });
  });

  it('prefers the top-left corner when the viewport is smaller than the widget', () => {
    // Arrange: a viewport narrower than the panel (e.g. a heavily-resized window).
    const tinyViewport = PANEL_WIDTH - 100;

    // Act.
    const result = clampToViewport(
      { x: 500, y: 500 },
      PANEL_WIDTH,
      PANEL_HEIGHT,
      tinyViewport,
      tinyViewport,
    );

    // Assert: the drag handle (top-left) stays reachable.
    expect(result).toEqual({ x: WIDGET_MARGIN_PX, y: WIDGET_MARGIN_PX });
  });
});

describe('toolbar drag gesture detection', () => {
  it('treats pointer travel within the threshold as a click', () => {
    // Arrange / Act / Assert.
    expect(isDragGesture(0, 0)).toBe(false);
    expect(isDragGesture(DRAG_ACTIVATION_THRESHOLD_PX, DRAG_ACTIVATION_THRESHOLD_PX)).toBe(false);
  });

  it('treats travel beyond the threshold on either axis as a drag', () => {
    // Arrange / Act / Assert.
    expect(isDragGesture(DRAG_ACTIVATION_THRESHOLD_PX + 1, 0)).toBe(true);
    expect(isDragGesture(0, -(DRAG_ACTIVATION_THRESHOLD_PX + 1))).toBe(true);
  });
});
