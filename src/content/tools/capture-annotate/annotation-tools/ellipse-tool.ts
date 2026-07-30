import { ellipseFromDrag, HIT_SLACK_PX } from '../annotation-geometry';
import type { Annotation, AnnotationPoint, AnnotationToolSpec } from './annotation-tool';
import { applyStrokeStyle } from './annotation-tool';

/** Ellipse inscribed in the dragged bounds — circle a detail without covering it. */
export const EllipseTool: AnnotationToolSpec = {
  id: 'ellipse',
  name: 'Ellipse',
  icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="8" ry="6"/></svg>',

  render(ctx: CanvasRenderingContext2D, annotation: Annotation): void {
    const { cx, cy, rx, ry } = ellipseFromDrag(annotation.start, annotation.end);

    applyStrokeStyle(ctx, annotation.style);
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
  },

  // Elliptical test, not the bounding box: clicks in the box corners fall through to shapes
  // underneath. The interior counts — a circled detail is grabbed by the detail itself.
  hitTest(_ctx: CanvasRenderingContext2D, annotation: Annotation, point: AnnotationPoint): boolean {
    const { cx, cy, rx, ry } = ellipseFromDrag(annotation.start, annotation.end);
    const reachX = rx + HIT_SLACK_PX;
    const reachY = ry + HIT_SLACK_PX;
    const dx = (point.x - cx) / reachX;
    const dy = (point.y - cy) / reachY;

    return dx * dx + dy * dy <= 1;
  },
};
