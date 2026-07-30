import { describe, expect, it } from 'vitest';
import {
  splitAnnotationLines,
  stampFontSizePx,
  textFontSizePx,
  textLineHeightPx,
} from '@content/tools/capture-annotate/text-metrics';

describe('textFontSizePx / stampFontSizePx', () => {
  it('grow with the stroke width so one control scales every text tool', () => {
    expect(textFontSizePx(4)).toBeGreaterThan(textFontSizePx(2));
    expect(stampFontSizePx(4)).toBeGreaterThan(stampFontSizePx(2));
  });

  it('keeps stamps noticeably larger than labels at the same width', () => {
    for (const widthPx of [2, 4, 7]) {
      expect(stampFontSizePx(widthPx)).toBeGreaterThan(textFontSizePx(widthPx));
    }
  });

  it('stays readable at the thinnest preset', () => {
    expect(textFontSizePx(1)).toBeGreaterThanOrEqual(12);
  });
});

describe('textLineHeightPx', () => {
  it('is proportionally larger than the font size', () => {
    expect(textLineHeightPx(20)).toBe(25);
    expect(textLineHeightPx(16)).toBeGreaterThan(16);
  });
});

describe('splitAnnotationLines', () => {
  it('splits on newlines, normalizing Windows line endings', () => {
    expect(splitAnnotationLines('a\r\nb\nc')).toEqual(['a', 'b', 'c']);
  });

  it('keeps interior empty lines but drops trailing whitespace-only ones', () => {
    expect(splitAnnotationLines('a\n\nb\n \n')).toEqual(['a', '', 'b']);
  });

  it('returns nothing for whitespace-only input', () => {
    expect(splitAnnotationLines('  \n \n')).toEqual([]);
  });
});
