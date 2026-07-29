import { describe, expect, it } from 'vitest';
import type { RulersGuidesState } from '@shared/types';
import {
  clampGuidePosition,
  createDefaultRulersGuidesState,
  firstTickAt,
  guideDropDeletes,
  isMajorTick,
  MAJOR_TICK_INTERVAL_PX,
  MAJOR_TICK_LENGTH_PX,
  MEDIUM_TICK_INTERVAL_PX,
  MEDIUM_TICK_LENGTH_PX,
  MINOR_TICK_INTERVAL_PX,
  MINOR_TICK_LENGTH_PX,
  RULER_THICKNESS_PX,
  sanitizeRulersGuidesState,
  tickLengthFor,
} from '@content/tools/rulers-guides/ruler-geometry';

const DOCUMENT_SIZE_PX = 3000;
const FAR_FROM_RULERS_PX = 500;

describe('rulers & guides default state', () => {
  it('starts with visible rulers and no guides', () => {
    // Arrange / Act / Assert.
    expect(createDefaultRulersGuidesState()).toEqual({ rulersVisible: true, guides: [] });
  });
});

describe('rulers & guides state sanitization', () => {
  it('drops malformed guides and keeps valid ones', () => {
    // Arrange.
    const state = {
      rulersVisible: true,
      guides: [
        { axis: 'vertical', positionPx: 100 },
        { axis: 'diagonal', positionPx: 50 },
        { axis: 'horizontal', positionPx: Number.NaN },
        { axis: 'horizontal', positionPx: -10 },
        { axis: 'horizontal', positionPx: 240.6 },
      ],
    } as unknown as RulersGuidesState;

    // Act.
    const sanitized = sanitizeRulersGuidesState(state);

    // Assert: only the two valid guides survive, with rounded positions.
    expect(sanitized.guides).toEqual([
      { axis: 'vertical', positionPx: 100 },
      { axis: 'horizontal', positionPx: 241 },
    ]);
  });

  it('repairs a non-array guides value and a missing visibility flag', () => {
    // Arrange.
    const state = { rulersVisible: undefined, guides: null } as unknown as RulersGuidesState;

    // Act.
    const sanitized = sanitizeRulersGuidesState(state);

    // Assert.
    expect(sanitized).toEqual({ rulersVisible: true, guides: [] });
  });
});

describe('ruler tick math', () => {
  it('aligns the first tick to the interval at or after the scroll offset', () => {
    // Arrange / Act / Assert.
    expect(firstTickAt(0, MINOR_TICK_INTERVAL_PX)).toBe(0);
    expect(firstTickAt(101, MINOR_TICK_INTERVAL_PX)).toBe(110);
    expect(firstTickAt(110, MINOR_TICK_INTERVAL_PX)).toBe(110);
  });

  it('grades tick lengths: major beats medium beats minor', () => {
    // Arrange / Act / Assert.
    expect(tickLengthFor(MAJOR_TICK_INTERVAL_PX)).toBe(MAJOR_TICK_LENGTH_PX);
    expect(tickLengthFor(MEDIUM_TICK_INTERVAL_PX)).toBe(MEDIUM_TICK_LENGTH_PX);
    expect(tickLengthFor(MINOR_TICK_INTERVAL_PX)).toBe(MINOR_TICK_LENGTH_PX);
  });

  it('labels only major ticks', () => {
    // Arrange / Act / Assert.
    expect(isMajorTick(MAJOR_TICK_INTERVAL_PX * 3)).toBe(true);
    expect(isMajorTick(MEDIUM_TICK_INTERVAL_PX)).toBe(false);
  });
});

describe('guide drop-to-delete rule', () => {
  it('deletes a vertical guide dropped on the left ruler', () => {
    // Arrange / Act / Assert.
    expect(guideDropDeletes('vertical', RULER_THICKNESS_PX, FAR_FROM_RULERS_PX)).toBe(true);
    expect(guideDropDeletes('vertical', RULER_THICKNESS_PX + 1, FAR_FROM_RULERS_PX)).toBe(false);
  });

  it('deletes a horizontal guide dropped on the top ruler', () => {
    // Arrange / Act / Assert.
    expect(guideDropDeletes('horizontal', FAR_FROM_RULERS_PX, RULER_THICKNESS_PX)).toBe(true);
    expect(guideDropDeletes('horizontal', FAR_FROM_RULERS_PX, RULER_THICKNESS_PX + 1)).toBe(false);
  });

  it('never deletes a guide for the opposite ruler band', () => {
    // Arrange / Act / Assert: a vertical guide near the TOP ruler must survive.
    expect(guideDropDeletes('vertical', FAR_FROM_RULERS_PX, 0)).toBe(false);
  });
});

describe('guide position clamping', () => {
  it('keeps positions inside the document and rounds them', () => {
    // Arrange / Act / Assert.
    expect(clampGuidePosition(-50, DOCUMENT_SIZE_PX)).toBe(0);
    expect(clampGuidePosition(DOCUMENT_SIZE_PX + 100, DOCUMENT_SIZE_PX)).toBe(DOCUMENT_SIZE_PX);
    expect(clampGuidePosition(123.7, DOCUMENT_SIZE_PX)).toBe(124);
  });
});
