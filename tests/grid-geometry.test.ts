import { describe, expect, it } from 'vitest';
import {
  BASELINE_LINE_THICKNESS_PX,
  buildBaselineGradient,
  buildFrameStyle,
  createDefaultGridState,
  DEFAULT_BASELINE_PX,
  DEFAULT_COLUMNS,
  DEFAULT_GRID_COLOR,
  DEFAULT_GRID_OPACITY,
  DEFAULT_GUTTER_PX,
  FLUID_WIDTH,
  MAX_COLUMNS,
  MIN_COLUMNS,
  MIN_FRAME_WIDTH_PX,
  MIN_GRID_OPACITY,
  sanitizeGridState,
} from '@content/tools/grid-overlay/grid-geometry';

const CUSTOM_MAX_WIDTH_PX = 1200;
const CUSTOM_MARGIN_PX = 32;

describe('grid overlay default state', () => {
  it('starts as a visible 12-column red grid with no baseline', () => {
    // Arrange / Act.
    const state = createDefaultGridState();

    // Assert.
    expect(state.columns).toBe(DEFAULT_COLUMNS);
    expect(state.gutterPx).toBe(DEFAULT_GUTTER_PX);
    expect(state.maxWidthPx).toBe(FLUID_WIDTH);
    expect(state.opacity).toBe(DEFAULT_GRID_OPACITY);
    expect(state.color).toBe(DEFAULT_GRID_COLOR);
    expect(state.showBaseline).toBe(false);
    expect(state.hidden).toBe(false);
  });
});

describe('grid overlay state sanitization', () => {
  it('clamps the column count into the allowed range', () => {
    // Arrange.
    const state = createDefaultGridState();

    // Act / Assert.
    expect(sanitizeGridState({ ...state, columns: 0 }).columns).toBe(MIN_COLUMNS);
    expect(sanitizeGridState({ ...state, columns: 99 }).columns).toBe(MAX_COLUMNS);
  });

  it('repairs non-finite numbers to defaults', () => {
    // Arrange.
    const state = { ...createDefaultGridState(), columns: Number.NaN, baselinePx: Number.NaN };

    // Act.
    const sanitized = sanitizeGridState(state);

    // Assert.
    expect(sanitized.columns).toBe(DEFAULT_COLUMNS);
    expect(sanitized.baselinePx).toBe(DEFAULT_BASELINE_PX);
  });

  it('keeps opacity above the visibility floor', () => {
    // Arrange / Act.
    const sanitized = sanitizeGridState({ ...createDefaultGridState(), opacity: 0 });

    // Assert.
    expect(sanitized.opacity).toBe(MIN_GRID_OPACITY);
  });

  it('rejects malformed colors and keeps valid hex values', () => {
    // Arrange.
    const state = createDefaultGridState();

    // Act / Assert.
    expect(sanitizeGridState({ ...state, color: 'red' }).color).toBe(DEFAULT_GRID_COLOR);
    expect(sanitizeGridState({ ...state, color: '#00FF00' }).color).toBe('#00FF00');
  });

  it('rounds fractional pixel values', () => {
    // Arrange / Act.
    const sanitized = sanitizeGridState({ ...createDefaultGridState(), gutterPx: 23.6 });

    // Assert.
    expect(sanitized.gutterPx).toBe(24);
  });

  it('snaps sliver max-widths up to the usable minimum instead of accepting them', () => {
    // Arrange.
    const state = createDefaultGridState();

    // Act / Assert: 25px would render an invisible sliver of a grid.
    expect(sanitizeGridState({ ...state, maxWidthPx: 25 }).maxWidthPx).toBe(MIN_FRAME_WIDTH_PX);
    expect(sanitizeGridState({ ...state, maxWidthPx: MIN_FRAME_WIDTH_PX }).maxWidthPx).toBe(
      MIN_FRAME_WIDTH_PX,
    );
  });

  it('treats zero and negative max-widths as fluid', () => {
    // Arrange.
    const state = createDefaultGridState();

    // Act / Assert.
    expect(sanitizeGridState({ ...state, maxWidthPx: FLUID_WIDTH }).maxWidthPx).toBe(FLUID_WIDTH);
    expect(sanitizeGridState({ ...state, maxWidthPx: -100 }).maxWidthPx).toBe(FLUID_WIDTH);
  });
});

describe('baseline gradient', () => {
  it('paints one line of constant thickness per row', () => {
    // Arrange / Act.
    const gradient = buildBaselineGradient(DEFAULT_BASELINE_PX);

    // Assert.
    expect(gradient).toContain(`currentColor ${BASELINE_LINE_THICKNESS_PX}px`);
    expect(gradient).toContain(`transparent ${DEFAULT_BASELINE_PX}px`);
    expect(gradient).toContain('to bottom');
  });
});

describe('frame style', () => {
  it('is fluid (no max-width) at the sentinel value', () => {
    // Arrange / Act.
    const style = buildFrameStyle({ ...createDefaultGridState(), maxWidthPx: FLUID_WIDTH });

    // Assert.
    expect(style.maxWidth).toBe('none');
  });

  it('applies max-width and side margins in pixels', () => {
    // Arrange / Act.
    const style = buildFrameStyle({
      ...createDefaultGridState(),
      maxWidthPx: CUSTOM_MAX_WIDTH_PX,
      marginPx: CUSTOM_MARGIN_PX,
    });

    // Assert.
    expect(style.maxWidth).toBe(`${CUSTOM_MAX_WIDTH_PX}px`);
    expect(style.paddingLeft).toBe(`${CUSTOM_MARGIN_PX}px`);
    expect(style.paddingRight).toBe(`${CUSTOM_MARGIN_PX}px`);
  });
});
