import { describe, expect, it } from 'vitest';
import {
  buildCaptureFileName,
  createDefaultCaptureAnnotateState,
  DEFAULT_ANNOTATION_COLOR,
  DEFAULT_STROKE_WIDTH_PX,
  formatCapturedAt,
  MAX_STROKE_WIDTH_PX,
  MIN_STROKE_WIDTH_PX,
  sanitizeCaptureAnnotateState,
} from '@content/tools/capture-annotate/capture-annotate-state';
import { DEFAULT_ANNOTATION_TOOL_ID } from '@content/tools/capture-annotate/annotation-tools';

describe('createDefaultCaptureAnnotateState', () => {
  it('starts on the default tool with the default red stroke', () => {
    expect(createDefaultCaptureAnnotateState()).toEqual({
      toolId: DEFAULT_ANNOTATION_TOOL_ID,
      color: DEFAULT_ANNOTATION_COLOR,
      strokeWidthPx: DEFAULT_STROKE_WIDTH_PX,
    });
  });
});

describe('sanitizeCaptureAnnotateState', () => {
  it('passes a valid state through unchanged', () => {
    const state = { toolId: 'ellipse', color: '#3B82F6', strokeWidthPx: 7 };

    expect(sanitizeCaptureAnnotateState(state)).toEqual(state);
  });

  it('falls back to the default tool for unknown tool ids', () => {
    const state = sanitizeCaptureAnnotateState({
      toolId: 'laser-pointer',
      color: '#3B82F6',
      strokeWidthPx: 4,
    });

    expect(state.toolId).toBe(DEFAULT_ANNOTATION_TOOL_ID);
  });

  it('repairs malformed colors', () => {
    for (const color of ['red', '#12345', '#12345G', '', 'rgb(1,2,3)']) {
      expect(sanitizeCaptureAnnotateState({ toolId: 'arrow', color, strokeWidthPx: 4 }).color).toBe(
        DEFAULT_ANNOTATION_COLOR,
      );
    }
  });

  it('clamps and rounds the stroke width', () => {
    const sanitize = (strokeWidthPx: number): number =>
      sanitizeCaptureAnnotateState({ toolId: 'arrow', color: '#EF4444', strokeWidthPx })
        .strokeWidthPx;

    expect(sanitize(0)).toBe(MIN_STROKE_WIDTH_PX);
    expect(sanitize(99)).toBe(MAX_STROKE_WIDTH_PX);
    expect(sanitize(3.4)).toBe(3);
    expect(sanitize(Number.NaN)).toBe(DEFAULT_STROKE_WIDTH_PX);
  });
});

describe('buildCaptureFileName', () => {
  const date = new Date(2026, 6, 30, 14, 5, 9);

  it('combines the sanitized host with a sortable timestamp', () => {
    expect(buildCaptureFileName('https://example.com/some/page?x=1', date)).toBe(
      'pixly-capture-example-com-20260730-140509.png',
    );
  });

  it('degrades unparseable hrefs to a generic slug', () => {
    expect(buildCaptureFileName('not a url', date)).toBe('pixly-capture-page-20260730-140509.png');
  });
});

describe('formatCapturedAt', () => {
  it('formats an ISO timestamp as local date + time', () => {
    // Built from local components so the expectation is timezone-independent.
    const iso = new Date(2026, 6, 30, 9, 7).toISOString();

    expect(formatCapturedAt(iso)).toBe('2026-07-30 09:07');
  });

  it('returns empty for unparseable input', () => {
    expect(formatCapturedAt('not-a-date')).toBe('');
  });
});
