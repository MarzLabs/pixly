import { describe, expect, it } from 'vitest';
import type { DistanceMeterState, Measurement } from '@shared/types';
import {
  applyAxisLock,
  computeDelta,
  createDefaultDistanceMeterState,
  DEFAULT_SNAP_RADIUS_PX,
  describeElement,
  formatMeasurementLabel,
  lineTransform,
  MAX_MEASUREMENTS,
  MAX_SNAP_RADIUS_PX,
  rectsEqual,
  sanitizeDistanceMeterState,
  segmentMidpoint,
  snapToRectEdges,
} from '@content/tools/distance-meter/distance-geometry';

const RECT = { left: 100, top: 200, right: 300, bottom: 400 };
const RIGHT_ANGLE_DEG = 90;

function makeMeasurement(offset: number): Measurement {
  return {
    segment: { ax: offset, ay: offset, bx: offset + 100, by: offset + 100 },
    startSnap: null,
    endSnap: null,
  };
}

describe('distance meter default state', () => {
  it('starts unpaused, without measurements, at the default snap radius', () => {
    // Arrange / Act / Assert.
    expect(createDefaultDistanceMeterState()).toEqual({
      measurements: [],
      snapRadiusPx: DEFAULT_SNAP_RADIUS_PX,
      paused: false,
    });
  });
});

describe('distance meter state sanitization', () => {
  it('drops measurements with non-finite or negative coordinates and keeps valid ones', () => {
    // Arrange.
    const state = {
      measurements: [
        makeMeasurement(0),
        { segment: { ax: Number.NaN, ay: 0, bx: 10, by: 10 }, startSnap: null, endSnap: null },
      ],
      snapRadiusPx: DEFAULT_SNAP_RADIUS_PX,
      paused: false,
    } as DistanceMeterState;

    // Act / Assert.
    expect(sanitizeDistanceMeterState(state).measurements).toEqual([makeMeasurement(0)]);
  });

  it('migrates the legacy single-measurement shape into a one-entry list', () => {
    // Arrange: the pre-multi-measurement persisted document.
    const legacy = {
      measurement: { ax: 0, ay: 0, bx: 100, by: 100 },
      startSnap: { left: 0, top: 0, right: 50, bottom: 50 },
      endSnap: null,
      paused: true,
    } as unknown as DistanceMeterState;

    // Act.
    const sanitized = sanitizeDistanceMeterState(legacy);

    // Assert.
    expect(sanitized.measurements).toEqual([
      {
        segment: { ax: 0, ay: 0, bx: 100, by: 100 },
        startSnap: { left: 0, top: 0, right: 50, bottom: 50 },
        endSnap: null,
      },
    ]);
    expect(sanitized.paused).toBe(true);
    expect(sanitized.snapRadiusPx).toBe(DEFAULT_SNAP_RADIUS_PX);
  });

  it('caps the measurement list, keeping the newest entries', () => {
    // Arrange.
    const overflowing = Array.from({ length: MAX_MEASUREMENTS + 5 }, (_, index) =>
      makeMeasurement(index),
    );
    const state = {
      measurements: overflowing,
      snapRadiusPx: DEFAULT_SNAP_RADIUS_PX,
      paused: false,
    } as DistanceMeterState;

    // Act.
    const sanitized = sanitizeDistanceMeterState(state);

    // Assert.
    expect(sanitized.measurements).toHaveLength(MAX_MEASUREMENTS);
    expect(sanitized.measurements.at(-1)).toEqual(makeMeasurement(MAX_MEASUREMENTS + 4));
  });

  it('clamps the snap radius and repairs non-finite values to the default', () => {
    // Arrange.
    const base = createDefaultDistanceMeterState();

    // Act / Assert.
    expect(sanitizeDistanceMeterState({ ...base, snapRadiusPx: -5 }).snapRadiusPx).toBe(0);
    expect(sanitizeDistanceMeterState({ ...base, snapRadiusPx: 999 }).snapRadiusPx).toBe(
      MAX_SNAP_RADIUS_PX,
    );
    expect(sanitizeDistanceMeterState({ ...base, snapRadiusPx: Number.NaN }).snapRadiusPx).toBe(
      DEFAULT_SNAP_RADIUS_PX,
    );
  });

  it('drops inverted or non-finite echo rects while keeping the measurement', () => {
    // Arrange: right < left is geometrically impossible.
    const state = {
      measurements: [
        {
          segment: { ax: 0, ay: 0, bx: 100, by: 100 },
          startSnap: { left: 100, top: 0, right: 50, bottom: 10 },
          endSnap: { left: Number.NaN, top: 0, right: 10, bottom: 10 },
        },
      ],
      snapRadiusPx: DEFAULT_SNAP_RADIUS_PX,
      paused: false,
    } as DistanceMeterState;

    // Act.
    const [sanitized] = sanitizeDistanceMeterState(state).measurements;

    // Assert.
    expect(sanitized?.segment).toEqual({ ax: 0, ay: 0, bx: 100, by: 100 });
    expect(sanitized?.startSnap).toBeNull();
    expect(sanitized?.endSnap).toBeNull();
  });
});

describe('snap echo equality (deduped boxes)', () => {
  it('detects when both endpoints snapped to the same element', () => {
    // Arrange.
    const rect = { left: 0, top: 0, right: 100, bottom: 50 };

    // Act / Assert.
    expect(rectsEqual(rect, { ...rect })).toBe(true);
    expect(rectsEqual(rect, { ...rect, right: 101 })).toBe(false);
    expect(rectsEqual(rect, null)).toBe(false);
    expect(rectsEqual(null, null)).toBe(true);
  });
});

describe('element descriptor', () => {
  it('formats tag, id, classes and dimensions', () => {
    // Arrange / Act.
    const descriptor = describeElement({
      tagName: 'DIV',
      id: 'hero',
      classNames: ['container', 'mx-auto', 'ignored-third-class'],
      width: 320.4,
      height: 240.6,
    });

    // Assert: at most two classes are shown, dimensions are rounded.
    expect(descriptor).toBe('div#hero.container.mx-auto · 320×241');
  });

  it('omits missing id and classes', () => {
    // Arrange / Act / Assert.
    expect(describeElement({ tagName: 'IMG', id: '', classNames: [], width: 64, height: 64 })).toBe(
      'img · 64×64',
    );
  });

  it('truncates runaway identities with an ellipsis', () => {
    // Arrange.
    const hugeId = 'x'.repeat(100);

    // Act.
    const descriptor = describeElement({
      tagName: 'DIV',
      id: hugeId,
      classNames: [],
      width: 10,
      height: 10,
    });

    // Assert.
    expect(descriptor).toContain('…');
    expect(descriptor.length).toBeLessThan(hugeId.length);
  });
});

describe('measurement deltas and formatting', () => {
  it('computes absolute deltas and a one-decimal diagonal', () => {
    // Arrange / Act: a 3-4-5 triangle scaled by 100.
    const delta = computeDelta({ ax: 0, ay: 0, bx: 300, by: 400 });

    // Assert.
    expect(delta).toEqual({ dx: 300, dy: 400, distance: 500 });
  });

  it('is direction-agnostic (measuring right-to-left gives the same deltas)', () => {
    // Arrange / Act / Assert.
    expect(computeDelta({ ax: 300, ay: 400, bx: 0, by: 0 })).toEqual(
      computeDelta({ ax: 0, ay: 0, bx: 300, by: 400 }),
    );
  });

  it('formats the readout as "dx × dy · distancepx"', () => {
    // Arrange / Act / Assert.
    expect(formatMeasurementLabel({ dx: 320, dy: 48, distance: 323.6 })).toBe('320 × 48 · 323.6px');
  });
});

describe('axis lock (Shift)', () => {
  it('locks to horizontal when the horizontal delta dominates', () => {
    // Arrange / Act.
    const locked = applyAxisLock({ ax: 0, ay: 0, bx: 100, by: 30 });

    // Assert.
    expect(locked).toEqual({ ax: 0, ay: 0, bx: 100, by: 0 });
  });

  it('locks to vertical when the vertical delta dominates', () => {
    // Arrange / Act.
    const locked = applyAxisLock({ ax: 0, ay: 0, bx: 30, by: 100 });

    // Assert.
    expect(locked).toEqual({ ax: 0, ay: 0, bx: 0, by: 100 });
  });
});

describe('edge snapping', () => {
  it('snaps each coordinate to the nearest edge within the radius', () => {
    // Arrange / Act: 5px away from the left edge, 3px away from the bottom edge.
    const snapped = snapToRectEdges(RECT.left + 5, RECT.bottom - 3, RECT, DEFAULT_SNAP_RADIUS_PX);

    // Assert.
    expect(snapped).toEqual({ x: RECT.left, y: RECT.bottom });
  });

  it('leaves coordinates outside the radius untouched', () => {
    // Arrange.
    const farX = RECT.left + DEFAULT_SNAP_RADIUS_PX + 50;
    const farY = RECT.top + DEFAULT_SNAP_RADIUS_PX + 60;

    // Act / Assert.
    expect(snapToRectEdges(farX, farY, RECT, DEFAULT_SNAP_RADIUS_PX)).toEqual({ x: farX, y: farY });
  });

  it('prefers the closer edge when both are in range', () => {
    // Arrange: a 6px-tall rect where the pointer sits 2px from the top and 4px from the bottom.
    const thinRect = { left: 0, top: 100, right: 50, bottom: 106 };

    // Act / Assert.
    expect(snapToRectEdges(25, 102, thinRect, DEFAULT_SNAP_RADIUS_PX).y).toBe(thinRect.top);
  });
});

describe('segment rendering geometry', () => {
  it('computes the rotated line length and angle', () => {
    // Arrange / Act: straight down = 90°.
    const transform = lineTransform({ ax: 10, ay: 10, bx: 10, by: 110 });

    // Assert.
    expect(transform.length).toBe(100);
    expect(transform.angleDeg).toBe(RIGHT_ANGLE_DEG);
  });

  it('places the label at the midpoint', () => {
    // Arrange / Act / Assert.
    expect(segmentMidpoint({ ax: 0, ay: 0, bx: 100, by: 50 })).toEqual({ x: 50, y: 25 });
  });
});
