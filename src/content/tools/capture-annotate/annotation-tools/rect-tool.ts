import { normalizedRect } from '../annotation-geometry';
import type { Annotation, AnnotationToolSpec } from './annotation-tool';
import { applyStrokeStyle } from './annotation-tool';

/** Hollow rectangle over the dragged bounds — frame a whole region of the capture. */
export const RectTool: AnnotationToolSpec = {
  id: 'rect',
  name: 'Rectangle',
  icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="6" width="16" height="12" rx="1"/></svg>',

  render(ctx: CanvasRenderingContext2D, annotation: Annotation): void {
    const rect = normalizedRect(annotation.start, annotation.end);

    applyStrokeStyle(ctx, annotation.style);
    ctx.beginPath();
    ctx.rect(rect.left, rect.top, rect.width, rect.height);
    ctx.stroke();
  },
};
