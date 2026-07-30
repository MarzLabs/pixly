import { distanceToSegment, HIT_SLACK_PX } from '../annotation-geometry';
import type { Annotation, AnnotationPoint, AnnotationToolSpec } from './annotation-tool';
import { applyStrokeStyle } from './annotation-tool';

/** Straight line between the drag endpoints — underline or connect without pointing. */
export const LineTool: AnnotationToolSpec = {
  id: 'line',
  name: 'Line',
  icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19L19 5"/></svg>',

  render(ctx: CanvasRenderingContext2D, annotation: Annotation): void {
    const { start, end, style } = annotation;

    applyStrokeStyle(ctx, style);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  },

  hitTest(_ctx: CanvasRenderingContext2D, annotation: Annotation, point: AnnotationPoint): boolean {
    const threshold = annotation.style.strokeWidthPx / 2 + HIT_SLACK_PX;

    return distanceToSegment(point, annotation.start, annotation.end) <= threshold;
  },
};
