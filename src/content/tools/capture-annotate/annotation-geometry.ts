import type { AnnotationPoint } from './annotation-tools/annotation-tool';

/**
 * Pure geometry helpers shared by the annotation tools (spec: capture_annotate_tool). No DOM or
 * canvas access, so drag normalization and arrowhead math are unit-testable.
 */

/** Axis-aligned rect with non-negative dimensions, whatever direction the drag went. */
export interface NormalizedRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Ellipse described by its center and non-negative radii. */
export interface EllipseGeometry {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

/** Both wing endpoints of an arrowhead, in the same coordinate space as the shaft. */
export interface ArrowHead {
  left: AnnotationPoint;
  right: AnnotationPoint;
}

/** Wing angle off the shaft. 30° reads as an arrow at any stroke width. */
const ARROW_WING_ANGLE_RAD = Math.PI / 6;

/** Arrowhead size scales with the stroke so thick arrows do not end in a stubby tip. */
const ARROW_HEAD_PER_STROKE_PX = 4;
const MIN_ARROW_HEAD_PX = 10;

/** Drags shorter than this commit nothing: they are clicks, not shapes. */
export const MIN_DRAG_DISTANCE_PX = 3;

/** Grab slack around shapes in move mode, so thin strokes need no pixel-perfect aim. */
export const HIT_SLACK_PX = 6;

/** Normalizes a drag into a rect regardless of which corner the user started from. */
export function normalizedRect(start: AnnotationPoint, end: AnnotationPoint): NormalizedRect {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y),
  };
}

/** The ellipse inscribed in the dragged rect (Figma-style: drag defines the bounding box). */
export function ellipseFromDrag(start: AnnotationPoint, end: AnnotationPoint): EllipseGeometry {
  const rect = normalizedRect(start, end);

  return {
    cx: rect.left + rect.width / 2,
    cy: rect.top + rect.height / 2,
    rx: rect.width / 2,
    ry: rect.height / 2,
  };
}

/** Straight-line length of a drag, used to discard accidental clicks. */
export function dragDistance(start: AnnotationPoint, end: AnnotationPoint): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

/** Distance from a point to the closest spot on segment a→b; a degenerate segment is a point. */
export function distanceToSegment(
  point: AnnotationPoint,
  a: AnnotationPoint,
  b: AnnotationPoint,
): number {
  const abX = b.x - a.x;
  const abY = b.y - a.y;
  const lengthSq = abX * abX + abY * abY;

  if (lengthSq === 0) {
    return Math.hypot(point.x - a.x, point.y - a.y);
  }

  const t = Math.min(1, Math.max(0, ((point.x - a.x) * abX + (point.y - a.y) * abY) / lengthSq));

  return Math.hypot(point.x - (a.x + t * abX), point.y - (a.y + t * abY));
}

/** Whether the point falls inside the rect expanded by `pad` on every side. */
export function pointInRect(point: AnnotationPoint, rect: NormalizedRect, pad: number): boolean {
  return (
    point.x >= rect.left - pad &&
    point.x <= rect.left + rect.width + pad &&
    point.y >= rect.top - pad &&
    point.y <= rect.top + rect.height + pad
  );
}

/** Arrowhead length for a given stroke width, floored so thin arrows keep a visible tip. */
export function arrowHeadLength(strokeWidthPx: number): number {
  return Math.max(MIN_ARROW_HEAD_PX, strokeWidthPx * ARROW_HEAD_PER_STROKE_PX);
}

/**
 * Endpoints of the two arrowhead wings for a shaft from `start` to `end`. Wings fold back from
 * the tip toward the shaft, symmetric about it. A zero-length shaft points the head rightwards
 * (angle 0) instead of collapsing to NaN.
 */
export function arrowHeadPoints(
  start: AnnotationPoint,
  end: AnnotationPoint,
  headLengthPx: number,
): ArrowHead {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);

  const wing = (offset: number): AnnotationPoint => ({
    x: end.x - headLengthPx * Math.cos(angle + offset),
    y: end.y - headLengthPx * Math.sin(angle + offset),
  });

  return { left: wing(ARROW_WING_ANGLE_RAD), right: wing(-ARROW_WING_ANGLE_RAD) };
}
