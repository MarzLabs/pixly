import type { GridOverlayState } from '@shared/types';
import { clamp } from '@shared/lib/math';

/**
 * Pure state/geometry helpers for the Grid Overlay tool (spec: grid_overlay_tool). No DOM access,
 * so clamping, color validation and the baseline gradient are unit-testable.
 */

export const MIN_COLUMNS = 1;
export const MAX_COLUMNS = 24;
export const DEFAULT_COLUMNS = 12;

export const MIN_GUTTER_PX = 0;
export const MAX_GUTTER_PX = 400;
export const DEFAULT_GUTTER_PX = 24;

export const MIN_MARGIN_PX = 0;
export const MAX_MARGIN_PX = 1000;
export const DEFAULT_MARGIN_PX = 0;

/** Sentinel meaning "no max-width": the grid frame spans the full viewport width. */
export const FLUID_WIDTH = 0;
/** Non-fluid frames below this are useless slivers; values snap up so the grid stays usable. */
export const MIN_FRAME_WIDTH_PX = 200;
export const MAX_FRAME_WIDTH_PX = 10000;

export const MIN_GRID_OPACITY = 0.05;
export const MAX_GRID_OPACITY = 1;
export const DEFAULT_GRID_OPACITY = 0.15;

/** Figma paints layout grids red by default; familiarity wins here. */
export const DEFAULT_GRID_COLOR = '#FF3B30';

export const MIN_BASELINE_PX = 2;
export const MAX_BASELINE_PX = 200;
export const DEFAULT_BASELINE_PX = 8;
export const BASELINE_LINE_THICKNESS_PX = 1;

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function createDefaultGridState(): GridOverlayState {
  return {
    columns: DEFAULT_COLUMNS,
    gutterPx: DEFAULT_GUTTER_PX,
    marginPx: DEFAULT_MARGIN_PX,
    maxWidthPx: FLUID_WIDTH,
    opacity: DEFAULT_GRID_OPACITY,
    color: DEFAULT_GRID_COLOR,
    showBaseline: false,
    baselinePx: DEFAULT_BASELINE_PX,
    hidden: false,
  };
}

/** Repairs out-of-range or malformed persisted values to safe, in-range equivalents. */
export function sanitizeGridState(state: GridOverlayState): GridOverlayState {
  return {
    columns: clampInteger(state.columns, MIN_COLUMNS, MAX_COLUMNS, DEFAULT_COLUMNS),
    gutterPx: clampInteger(state.gutterPx, MIN_GUTTER_PX, MAX_GUTTER_PX, DEFAULT_GUTTER_PX),
    marginPx: clampInteger(state.marginPx, MIN_MARGIN_PX, MAX_MARGIN_PX, DEFAULT_MARGIN_PX),
    maxWidthPx: sanitizeMaxWidth(state.maxWidthPx),
    opacity: Number.isFinite(state.opacity)
      ? clamp(state.opacity, MIN_GRID_OPACITY, MAX_GRID_OPACITY)
      : DEFAULT_GRID_OPACITY,
    color: HEX_COLOR_PATTERN.test(state.color) ? state.color : DEFAULT_GRID_COLOR,
    showBaseline: state.showBaseline === true,
    baselinePx: clampInteger(
      state.baselinePx,
      MIN_BASELINE_PX,
      MAX_BASELINE_PX,
      DEFAULT_BASELINE_PX,
    ),
    hidden: state.hidden === true,
  };
}

function clampInteger(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }

  return clamp(Math.round(value), min, max);
}

/** Zero (and anything nonsensical) means fluid; real widths snap into the usable range. */
function sanitizeMaxWidth(value: number): number {
  if (!Number.isFinite(value) || value <= FLUID_WIDTH) {
    return FLUID_WIDTH;
  }

  return clamp(Math.round(value), MIN_FRAME_WIDTH_PX, MAX_FRAME_WIDTH_PX);
}

/**
 * CSS background for the baseline layer: a 1px line every `baselinePx`. Uses `currentColor` so
 * the grid node controls the color once, via its own `color` property.
 */
export function buildBaselineGradient(baselinePx: number): string {
  const lineEnd = `${BASELINE_LINE_THICKNESS_PX}px`;

  return (
    `repeating-linear-gradient(to bottom, currentColor 0px, currentColor ${lineEnd}, ` +
    `transparent ${lineEnd}, transparent ${baselinePx}px)`
  );
}

/** Inline styles for the grid frame (the centered, margin-padded max-width container). */
export function buildFrameStyle(state: GridOverlayState): {
  maxWidth: string;
  paddingLeft: string;
  paddingRight: string;
} {
  return {
    maxWidth: state.maxWidthPx === FLUID_WIDTH ? 'none' : `${state.maxWidthPx}px`,
    paddingLeft: `${state.marginPx}px`,
    paddingRight: `${state.marginPx}px`,
  };
}
