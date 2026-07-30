/**
 * Pure font metrics for the text-based annotation tools (text labels, emoji stamps). Sizes are
 * derived from the shared stroke-width presets so one control drives every tool's scale — no
 * separate font-size UI. No DOM access, so the derivations are unit-testable.
 */

/** Label font size for a stroke width: the S/M/L presets map to readable label sizes. */
export function textFontSizePx(strokeWidthPx: number): number {
  return Math.round(10 + strokeWidthPx * 3);
}

/** Line height for multi-line labels, proportional to the font size. */
export function textLineHeightPx(fontSizePx: number): number {
  return Math.round(fontSizePx * 1.25);
}

/** Emoji stamp size for a stroke width; stamps read best noticeably larger than labels. */
export function stampFontSizePx(strokeWidthPx: number): number {
  return Math.round(22 + strokeWidthPx * 4);
}

/**
 * Splits committed label text into render lines. Normalizes Windows/old-Mac line endings and
 * keeps interior empty lines (intentional spacing), but drops trailing whitespace-only lines.
 */
export function splitAnnotationLines(text: string): string[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  while (lines.length > 0 && (lines[lines.length - 1] ?? '').trim() === '') {
    lines.pop();
  }

  return lines;
}
