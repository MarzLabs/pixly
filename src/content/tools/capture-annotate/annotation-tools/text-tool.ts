import { DESIGN_TOKENS } from '@shared/constants/design-tokens';
import { HIT_SLACK_PX, pointInRect } from '../annotation-geometry';
import { splitAnnotationLines, textFontSizePx, textLineHeightPx } from '../text-metrics';
import type { Annotation, AnnotationPoint, AnnotationToolSpec } from './annotation-tool';

/**
 * Text label anchored at the click point ('text' interaction: the editor opens an inline input
 * and commits its value as `annotation.text`). Font size follows the shared stroke-width
 * presets, and a soft shadow keeps the label legible over any page background.
 */
export const TextTool: AnnotationToolSpec = {
  id: 'text',
  name: 'Text',
  icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 7V4h14v3"/><path d="M12 4v16"/><path d="M9 20h6"/></svg>',
  interaction: 'text',

  render(ctx: CanvasRenderingContext2D, annotation: Annotation): void {
    const lines = splitAnnotationLines(annotation.text ?? '');

    if (lines.length === 0) {
      return;
    }

    const fontSizePx = textFontSizePx(annotation.style.strokeWidthPx);
    const lineHeightPx = textLineHeightPx(fontSizePx);

    ctx.save();
    ctx.font = `600 ${fontSizePx}px ${DESIGN_TOKENS.fontFamily}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = annotation.style.color;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
    ctx.shadowBlur = 3;

    lines.forEach((line, index) => {
      ctx.fillText(line, annotation.start.x, annotation.start.y + index * lineHeightPx);
    });

    ctx.restore();
  },

  // The label's box is its measured widest line × line count, anchored at the top-left start.
  hitTest(ctx: CanvasRenderingContext2D, annotation: Annotation, point: AnnotationPoint): boolean {
    const box = textBounds(ctx, annotation);

    return box !== null && pointInRect(point, box, HIT_SLACK_PX);
  },

  bounds: textBounds,
};

function textBounds(
  ctx: CanvasRenderingContext2D,
  annotation: Annotation,
): { left: number; top: number; width: number; height: number } | null {
  const lines = splitAnnotationLines(annotation.text ?? '');

  if (lines.length === 0) {
    return null;
  }

  const fontSizePx = textFontSizePx(annotation.style.strokeWidthPx);

  ctx.save();
  ctx.font = `600 ${fontSizePx}px ${DESIGN_TOKENS.fontFamily}`;
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width));
  ctx.restore();

  return {
    left: annotation.start.x,
    top: annotation.start.y,
    width,
    height: lines.length * textLineHeightPx(fontSizePx),
  };
}
