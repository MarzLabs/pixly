import { arrowHeadLength, arrowHeadPoints } from '../annotation-geometry';
import type { Annotation, AnnotationToolSpec } from './annotation-tool';
import { applyStrokeStyle } from './annotation-tool';

/** Arrow: shaft from the drag start with the head at the drag end — "look HERE". */
export const ArrowTool: AnnotationToolSpec = {
  id: 'arrow',
  name: 'Arrow',
  icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 19L19 5"/><path d="M10 5h9v9"/></svg>',

  render(ctx: CanvasRenderingContext2D, annotation: Annotation): void {
    const { start, end, style } = annotation;
    const head = arrowHeadPoints(start, end, arrowHeadLength(style.strokeWidthPx));

    applyStrokeStyle(ctx, style);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.moveTo(head.left.x, head.left.y);
    ctx.lineTo(end.x, end.y);
    ctx.lineTo(head.right.x, head.right.y);
    ctx.stroke();
  },
};
