import { describe, expect, it } from 'vitest';
import {
  arrowHeadLength,
  arrowHeadPoints,
  distanceToSegment,
  dragDistance,
  ellipseFromDrag,
  gripAtPoint,
  normalizedRect,
  pointInRect,
  resizeCursorForGrip,
} from '@content/tools/capture-annotate/annotation-geometry';

describe('normalizedRect', () => {
  it('keeps a top-left → bottom-right drag as-is', () => {
    expect(normalizedRect({ x: 10, y: 20 }, { x: 40, y: 60 })).toEqual({
      left: 10,
      top: 20,
      width: 30,
      height: 40,
    });
  });

  it('normalizes a bottom-right → top-left drag to non-negative dimensions', () => {
    expect(normalizedRect({ x: 40, y: 60 }, { x: 10, y: 20 })).toEqual({
      left: 10,
      top: 20,
      width: 30,
      height: 40,
    });
  });

  it('collapses a zero-length drag to an empty rect at the point', () => {
    expect(normalizedRect({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({
      left: 5,
      top: 5,
      width: 0,
      height: 0,
    });
  });
});

describe('ellipseFromDrag', () => {
  it('inscribes the ellipse in the dragged bounds', () => {
    expect(ellipseFromDrag({ x: 10, y: 20 }, { x: 30, y: 60 })).toEqual({
      cx: 20,
      cy: 40,
      rx: 10,
      ry: 20,
    });
  });

  it('is direction-independent', () => {
    expect(ellipseFromDrag({ x: 30, y: 60 }, { x: 10, y: 20 })).toEqual(
      ellipseFromDrag({ x: 10, y: 20 }, { x: 30, y: 60 }),
    );
  });
});

describe('dragDistance', () => {
  it('returns the straight-line length (3-4-5 triangle)', () => {
    expect(dragDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it('returns zero for a click without movement', () => {
    expect(dragDistance({ x: 7, y: 7 }, { x: 7, y: 7 })).toBe(0);
  });
});

describe('distanceToSegment', () => {
  it('measures the perpendicular distance to the segment body', () => {
    expect(distanceToSegment({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3);
  });

  it('clamps to the nearest endpoint beyond the segment ends', () => {
    expect(distanceToSegment({ x: 13, y: 4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
    expect(distanceToSegment({ x: -3, y: -4 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(5);
  });

  it('degrades a zero-length segment to point distance', () => {
    expect(distanceToSegment({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5);
  });
});

describe('pointInRect', () => {
  const rect = { left: 10, top: 10, width: 20, height: 10 };

  it('accepts interior points and rejects exterior ones without padding', () => {
    expect(pointInRect({ x: 15, y: 12 }, rect, 0)).toBe(true);
    expect(pointInRect({ x: 31, y: 12 }, rect, 0)).toBe(false);
  });

  it('padding extends the rect on every side', () => {
    expect(pointInRect({ x: 34, y: 24 }, rect, 5)).toBe(true);
    expect(pointInRect({ x: 6, y: 6 }, rect, 5)).toBe(true);
    expect(pointInRect({ x: 36, y: 12 }, rect, 5)).toBe(false);
  });
});

describe('gripAtPoint', () => {
  const start = { x: 10, y: 10 };
  const end = { x: 100, y: 60 };

  it('grabs the endpoint within the radius and nothing outside it', () => {
    expect(gripAtPoint(start, end, { x: 12, y: 13 }, 8)).toBe('start');
    expect(gripAtPoint(start, end, { x: 104, y: 57 }, 8)).toBe('end');
    expect(gripAtPoint(start, end, { x: 55, y: 35 }, 8)).toBeNull();
  });

  it('prefers the end grip on collapsed shapes, so they can be dragged back open', () => {
    expect(gripAtPoint(start, start, { x: 11, y: 11 }, 8)).toBe('end');
  });
});

describe('resizeCursorForGrip', () => {
  it('picks the diagonal matching the grip corner', () => {
    expect(resizeCursorForGrip({ x: 100, y: 60 }, { x: 10, y: 10 })).toBe('nwse-resize');
    expect(resizeCursorForGrip({ x: 100, y: 10 }, { x: 10, y: 60 })).toBe('nesw-resize');
  });

  it('uses axis arrows for axis-aligned shapes and move for collapsed ones', () => {
    expect(resizeCursorForGrip({ x: 100, y: 10 }, { x: 10, y: 10 })).toBe('ew-resize');
    expect(resizeCursorForGrip({ x: 10, y: 60 }, { x: 10, y: 10 })).toBe('ns-resize');
    expect(resizeCursorForGrip({ x: 10, y: 10 }, { x: 10, y: 10 })).toBe('move');
  });
});

describe('arrowHeadLength', () => {
  it('scales with the stroke width', () => {
    expect(arrowHeadLength(4)).toBeGreaterThan(arrowHeadLength(2));
  });

  it('never drops below the minimum visible tip', () => {
    expect(arrowHeadLength(1)).toBe(10);
  });
});

describe('arrowHeadPoints', () => {
  it('folds both wings back from the tip, symmetric about a horizontal shaft', () => {
    const head = arrowHeadPoints({ x: 0, y: 0 }, { x: 100, y: 0 }, 10);

    // Both wings sit behind the tip at the same x, mirrored across the shaft.
    expect(head.left.x).toBeCloseTo(head.right.x, 6);
    expect(head.left.x).toBeLessThan(100);
    expect(head.left.y).toBeCloseTo(-head.right.y, 6);
    expect(Math.abs(head.left.y)).toBeGreaterThan(0);
  });

  it('places each wing exactly headLength away from the tip', () => {
    const tip = { x: 40, y: -25 };
    const head = arrowHeadPoints({ x: -10, y: 5 }, tip, 12);

    expect(dragDistance(head.left, tip)).toBeCloseTo(12, 6);
    expect(dragDistance(head.right, tip)).toBeCloseTo(12, 6);
  });

  it('degrades a zero-length shaft to a rightward-pointing head instead of NaN', () => {
    const head = arrowHeadPoints({ x: 5, y: 5 }, { x: 5, y: 5 }, 10);

    expect(Number.isFinite(head.left.x)).toBe(true);
    expect(Number.isFinite(head.right.y)).toBe(true);
    expect(head.left.x).toBeLessThan(5);
  });
});
