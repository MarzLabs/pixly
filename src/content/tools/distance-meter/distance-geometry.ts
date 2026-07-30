import type {
  DistanceMeterState,
  Measurement,
  MeasurementSegment,
  SnapTargetRect,
} from '@shared/types';
import { clamp } from '@shared/lib/math';

/**
 * Pure math for the Distance Meter tool (spec: distance_meter_tool). No DOM access, so deltas,
 * axis locking, edge snapping and formatting are unit-testable.
 */

/** Endpoint snap radius bounds; 0 disables snapping entirely. */
export const MIN_SNAP_RADIUS_PX = 0;
export const MAX_SNAP_RADIUS_PX = 50;
export const DEFAULT_SNAP_RADIUS_PX = 8;

/** Bounded measurement history: adding beyond this drops the oldest (FIFO). */
export const MAX_MEASUREMENTS = 20;

/** A press-and-release with less travel than this is a tap and adds no measurement. */
export const MIN_MEASUREMENT_PX = 3;

/** Green: readable on most pages and distinct from the cyan guides and the red grid. */
export const METER_COLOR = '#30D158';

/** Distances are shown with one decimal (diagonals are rarely integers). */
const DISTANCE_DECIMALS = 1;

const RAD_TO_DEG = 180 / Math.PI;

export function createDefaultDistanceMeterState(): DistanceMeterState {
  return { measurements: [], snapRadiusPx: DEFAULT_SNAP_RADIUS_PX, paused: false };
}

/**
 * Repairs malformed persisted values: broken measurements are dropped, the snap radius is
 * clamped, and the pre-multi-measurement shape ({ measurement, startSnap, endSnap }) migrates
 * into a one-entry list.
 */
export function sanitizeDistanceMeterState(state: DistanceMeterState): DistanceMeterState {
  return {
    measurements: collectMeasurements(state).slice(-MAX_MEASUREMENTS),
    snapRadiusPx: sanitizeSnapRadius(state.snapRadiusPx),
    paused: state.paused === true,
  };
}

function sanitizeSnapRadius(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_SNAP_RADIUS_PX;
  }

  return clamp(Math.round(value), MIN_SNAP_RADIUS_PX, MAX_SNAP_RADIUS_PX);
}

function collectMeasurements(state: DistanceMeterState): Measurement[] {
  const raw = Array.isArray(state.measurements) ? state.measurements : legacyMeasurements(state);

  return raw
    .map((entry) => sanitizeMeasurement(entry))
    .filter((entry): entry is Measurement => entry !== null);
}

/** Pre-multi-measurement documents stored a single segment at the state root. */
function legacyMeasurements(state: unknown): Measurement[] {
  const legacy = state as {
    measurement?: MeasurementSegment | null;
    startSnap?: SnapTargetRect | null;
    endSnap?: SnapTargetRect | null;
  };

  if (!legacy.measurement) {
    return [];
  }

  return [
    {
      segment: legacy.measurement,
      startSnap: legacy.startSnap ?? null,
      endSnap: legacy.endSnap ?? null,
    },
  ];
}

function sanitizeMeasurement(entry: Measurement | null | undefined): Measurement | null {
  if (!entry || !isValidSegment(entry.segment)) {
    return null;
  }

  return {
    segment: roundSegment(entry.segment),
    startSnap: isValidRect(entry.startSnap) ? roundRect(entry.startSnap) : null,
    endSnap: isValidRect(entry.endSnap) ? roundRect(entry.endSnap) : null,
  };
}

function isValidRect(rect: SnapTargetRect | null | undefined): rect is SnapTargetRect {
  return (
    rect != null &&
    [rect.left, rect.top, rect.right, rect.bottom].every((value) => Number.isFinite(value)) &&
    rect.right >= rect.left &&
    rect.bottom >= rect.top
  );
}

function roundRect(rect: SnapTargetRect): SnapTargetRect {
  return {
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
  };
}

/** True when two snap echoes cover the same box (both endpoints snapped to the same element). */
export function rectsEqual(a: SnapTargetRect | null, b: SnapTargetRect | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }

  return a.left === b.left && a.top === b.top && a.right === b.right && a.bottom === b.bottom;
}

function isValidSegment(segment: MeasurementSegment | null): segment is MeasurementSegment {
  return (
    segment !== null &&
    [segment.ax, segment.ay, segment.bx, segment.by].every(
      (value) => Number.isFinite(value) && value >= 0,
    )
  );
}

function roundSegment(segment: MeasurementSegment): MeasurementSegment {
  return {
    ax: Math.round(segment.ax),
    ay: Math.round(segment.ay),
    bx: Math.round(segment.bx),
    by: Math.round(segment.by),
  };
}

export interface MeasurementDelta {
  dx: number;
  dy: number;
  distance: number;
}

/** Absolute deltas and the straight-line distance (one decimal) of a segment. */
export function computeDelta(segment: MeasurementSegment): MeasurementDelta {
  const dx = Math.abs(segment.bx - segment.ax);
  const dy = Math.abs(segment.by - segment.ay);
  const factor = 10 ** DISTANCE_DECIMALS;

  return { dx, dy, distance: Math.round(Math.hypot(dx, dy) * factor) / factor };
}

/** Readout text: "320 × 48 · 323.6px". */
export function formatMeasurementLabel(delta: MeasurementDelta): string {
  return `${delta.dx} × ${delta.dy} · ${delta.distance}px`;
}

/** Shift-drag constrains the segment to its dominant axis (like design tools). */
export function applyAxisLock(segment: MeasurementSegment): MeasurementSegment {
  const dx = Math.abs(segment.bx - segment.ax);
  const dy = Math.abs(segment.by - segment.ay);

  return dx >= dy ? { ...segment, by: segment.ay } : { ...segment, bx: segment.ax };
}

export interface EdgeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Snaps a point's coordinates independently to the nearest rect edge within the radius, so an
 * endpoint dropped near an element border lands exactly on it (that border is what one measures).
 */
export function snapToRectEdges(
  x: number,
  y: number,
  rect: EdgeRect,
  radius: number,
): { x: number; y: number } {
  return {
    x: snapToNearest(x, [rect.left, rect.right], radius),
    y: snapToNearest(y, [rect.top, rect.bottom], radius),
  };
}

function snapToNearest(value: number, candidates: number[], radius: number): number {
  let best = value;
  let bestDistance = radius;

  for (const candidate of candidates) {
    const distance = Math.abs(value - candidate);

    if (distance <= bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }

  return best;
}

/** At most this many classes are shown in an element descriptor. */
const MAX_DESCRIPTOR_CLASSES = 2;

/** Hard cap for the descriptor text so huge ids/classes cannot blow up the tag. */
const MAX_DESCRIPTOR_LENGTH = 48;

const ELLIPSIS = '…';

export interface ElementDescriptorInput {
  tagName: string;
  id: string;
  classNames: string[];
  width: number;
  height: number;
}

/**
 * Compact DevTools-style identity for the snapped element: "div#hero.container.mx-auto · 320×240".
 * Disambiguates WHICH element an endpoint is snapping to when elements are nested or adjacent.
 */
export function describeElement(input: ElementDescriptorInput): string {
  const id = input.id ? `#${input.id}` : '';
  const classes = input.classNames
    .slice(0, MAX_DESCRIPTOR_CLASSES)
    .map((name) => `.${name}`)
    .join('');

  let identity = `${input.tagName.toLowerCase()}${id}${classes}`;

  if (identity.length > MAX_DESCRIPTOR_LENGTH) {
    identity = `${identity.slice(0, MAX_DESCRIPTOR_LENGTH)}${ELLIPSIS}`;
  }

  return `${identity} · ${Math.round(input.width)}×${Math.round(input.height)}`;
}

/** Geometry for rendering the segment as a rotated 1D element. */
export function lineTransform(segment: MeasurementSegment): {
  length: number;
  angleDeg: number;
} {
  const dx = segment.bx - segment.ax;
  const dy = segment.by - segment.ay;

  return { length: Math.hypot(dx, dy), angleDeg: Math.atan2(dy, dx) * RAD_TO_DEG };
}

/** Midpoint of the segment, where the readout label sits. */
export function segmentMidpoint(segment: MeasurementSegment): { x: number; y: number } {
  const half = 2;

  return { x: (segment.ax + segment.bx) / half, y: (segment.ay + segment.by) / half };
}
