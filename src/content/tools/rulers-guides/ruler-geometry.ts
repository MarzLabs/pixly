import type { GuideAxis, GuideLine, RulersGuidesState } from '@shared/types';
import { clamp } from '@shared/lib/math';

/**
 * Pure helpers for the Rulers & Guides tool (spec: rulers_guides_tool). No DOM access, so tick
 * math, guide sanitization and the drop-to-delete rule are unit-testable.
 */

/** Thickness of the edge rulers; also the drop band that deletes a guide dragged back onto them. */
export const RULER_THICKNESS_PX = 20;

export const MINOR_TICK_INTERVAL_PX = 10;
export const MEDIUM_TICK_INTERVAL_PX = 50;
export const MAJOR_TICK_INTERVAL_PX = 100;

export const MINOR_TICK_LENGTH_PX = 5;
export const MEDIUM_TICK_LENGTH_PX = 9;
export const MAJOR_TICK_LENGTH_PX = 14;

/** Photoshop-style cyan: instantly recognizable as a guide, distinct from the grid's red. */
export const GUIDE_COLOR = '#00B4FF';

export function createDefaultRulersGuidesState(): RulersGuidesState {
  return { rulersVisible: true, guides: [] };
}

/** Drops malformed guides and repairs flags, so hand-edited storage can never break the tool. */
export function sanitizeRulersGuidesState(state: RulersGuidesState): RulersGuidesState {
  const guides = Array.isArray(state.guides)
    ? state.guides.filter(isValidGuide).map((guide) => ({
        axis: guide.axis,
        positionPx: Math.round(guide.positionPx),
      }))
    : [];

  return { rulersVisible: state.rulersVisible !== false, guides };
}

function isValidGuide(guide: GuideLine): boolean {
  return (
    (guide.axis === 'vertical' || guide.axis === 'horizontal') &&
    Number.isFinite(guide.positionPx) &&
    guide.positionPx >= 0
  );
}

/** First tick position (document px) at or after the scroll offset, aligned to the interval. */
export function firstTickAt(scrollPx: number, intervalPx: number): number {
  return Math.ceil(scrollPx / intervalPx) * intervalPx;
}

/** Tick mark length for a document position: major beats medium beats minor. */
export function tickLengthFor(positionPx: number): number {
  if (positionPx % MAJOR_TICK_INTERVAL_PX === 0) {
    return MAJOR_TICK_LENGTH_PX;
  }

  if (positionPx % MEDIUM_TICK_INTERVAL_PX === 0) {
    return MEDIUM_TICK_LENGTH_PX;
  }

  return MINOR_TICK_LENGTH_PX;
}

/** Labels are drawn on major ticks only. */
export function isMajorTick(positionPx: number): boolean {
  return positionPx % MAJOR_TICK_INTERVAL_PX === 0;
}

/**
 * A guide released back over its source ruler is deleted (classic design-tool gesture): vertical
 * guides come from the left ruler, horizontal ones from the top ruler.
 */
export function guideDropDeletes(axis: GuideAxis, clientX: number, clientY: number): boolean {
  return axis === 'vertical' ? clientX <= RULER_THICKNESS_PX : clientY <= RULER_THICKNESS_PX;
}

/** Clamps a guide's document position into the document's bounds. */
export function clampGuidePosition(positionPx: number, documentSizePx: number): number {
  return Math.round(clamp(positionPx, 0, Math.max(0, documentSizePx)));
}
