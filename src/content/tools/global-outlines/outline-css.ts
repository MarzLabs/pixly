import { SHADOW_HOST_ID } from '@shared/constants';
import { OUTLINE_COLOR_MODES, type GlobalOutlinesState } from '@shared/types';

/**
 * Pure CSS generation for the Global Outlines tool (spec: global_outlines_tool). No DOM access,
 * so the stylesheet rules — depth cascade, palette cycling, host exclusion — are unit-testable.
 */

export const DEFAULT_OUTLINE_WIDTH_PX = 1;

/**
 * How many nesting levels get their own color before the palette saturates. Rules share the
 * universal selector's zero specificity, so for any element the LAST matching (deepest) rule
 * wins — that source-order cascade is what colors each element by its depth.
 */
export const MAX_DEPTH_LEVELS = 12;

/** Distinct hues that read on both light and dark pages; cycled across nesting levels. */
export const DEPTH_PALETTE: readonly string[] = [
  '#2196F3',
  '#4CAF50',
  '#FF9800',
  '#E91E63',
  '#9C27B0',
  '#00BCD4',
  '#FFC107',
  '#F44336',
];

/** Color used by the 'single' mode: vivid enough to read over any page background. */
export const SINGLE_MODE_COLOR = '#FF2D95';

export function createDefaultGlobalOutlinesState(): GlobalOutlinesState {
  return { widthPx: DEFAULT_OUTLINE_WIDTH_PX, colorMode: 'by-depth' };
}

/** Repairs out-of-range or unknown persisted values (e.g. hand-edited storage) to safe defaults. */
export function sanitizeGlobalOutlinesState(state: GlobalOutlinesState): GlobalOutlinesState {
  const widthPx =
    Number.isFinite(state.widthPx) && state.widthPx >= DEFAULT_OUTLINE_WIDTH_PX
      ? Math.round(state.widthPx)
      : DEFAULT_OUTLINE_WIDTH_PX;

  const colorMode = OUTLINE_COLOR_MODES.includes(state.colorMode) ? state.colorMode : 'by-depth';

  return { widthPx, colorMode };
}

/**
 * Builds the full stylesheet for the given state. `!important` is deliberate: pages routinely
 * reset outlines (e.g. `* { outline: none }`), and a debug overlay must win over those resets.
 * Pixly's own shadow host is excluded so the tool never outlines the extension's UI.
 */
export function buildOutlineCss(state: GlobalOutlinesState): string {
  const { widthPx, colorMode } = sanitizeGlobalOutlinesState(state);

  const rules =
    colorMode === 'single' ? buildSingleColorRules(widthPx) : buildDepthColorRules(widthPx);

  rules.push(`#${SHADOW_HOST_ID} { outline: none !important; }`);

  return rules.join('\n');
}

function buildSingleColorRules(widthPx: number): string[] {
  return [`* { outline: ${widthPx}px solid ${SINGLE_MODE_COLOR} !important; }`];
}

/** Palette color for a 1-based nesting level. The modulo keeps any level within the palette. */
export function depthColor(level: number): string {
  return DEPTH_PALETTE[(level - 1) % DEPTH_PALETTE.length] ?? SINGLE_MODE_COLOR;
}

function buildDepthColorRules(widthPx: number): string[] {
  const rules = [`* { outline: ${widthPx}px solid ${depthColor(1)} !important; }`];

  // '* *' matches depth ≥ 2, '* * *' depth ≥ 3, … — the deepest matching rule wins by source
  // order, so each element ends up colored by min(its depth, MAX_DEPTH_LEVELS).
  for (let level = 2; level <= MAX_DEPTH_LEVELS; level += 1) {
    const selector = Array.from({ length: level }, () => '*').join(' ');

    rules.push(`${selector} { outline-color: ${depthColor(level)} !important; }`);
  }

  return rules;
}
