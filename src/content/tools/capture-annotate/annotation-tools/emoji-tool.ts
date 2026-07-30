import { DESIGN_TOKENS } from '@shared/constants/design-tokens';
import { HIT_SLACK_PX, pointInRect } from '../annotation-geometry';
import { stampFontSizePx } from '../text-metrics';
import type { Annotation, AnnotationPoint, AnnotationToolSpec } from './annotation-tool';

/** Reaction/status set: point, judge, warn, celebrate — the vocabulary of a visual review. */
export const EMOJI_GLYPHS: readonly string[] = [
  '👍',
  '👎',
  '❗',
  '❓',
  '⚠️',
  '🔥',
  '🎯',
  '👀',
  '✅',
  '❌',
  '💡',
  '🐛',
];

/**
 * Emoji stamp centered on the click point ('stamp' interaction: the editor offers `glyphs` as a
 * secondary palette and commits the selected one as `annotation.text`). Stamp size follows the
 * shared stroke-width presets, larger than text labels so a single glyph carries.
 */
export const EmojiTool: AnnotationToolSpec = {
  id: 'emoji',
  name: 'Emoji',
  icon: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M8.5 14a4.5 4.5 0 007 0"/><path d="M9 9.5h.01M15 9.5h.01"/></svg>',
  interaction: 'stamp',
  glyphs: EMOJI_GLYPHS,

  render(ctx: CanvasRenderingContext2D, annotation: Annotation): void {
    const glyph = annotation.text ?? '';

    if (glyph.length === 0) {
      return;
    }

    ctx.save();
    ctx.font = `${stampFontSizePx(annotation.style.strokeWidthPx)}px ${DESIGN_TOKENS.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, annotation.start.x, annotation.start.y);
    ctx.restore();
  },

  // A square of the stamp's font size, centered on the click point like the glyph itself.
  hitTest(_ctx: CanvasRenderingContext2D, annotation: Annotation, point: AnnotationPoint): boolean {
    if (!annotation.text) {
      return false;
    }

    const half = stampFontSizePx(annotation.style.strokeWidthPx) / 2;

    return pointInRect(
      point,
      {
        left: annotation.start.x - half,
        top: annotation.start.y - half,
        width: half * 2,
        height: half * 2,
      },
      HIT_SLACK_PX,
    );
  },
};
