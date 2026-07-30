import type { CaptureAnnotateState } from '@shared/types';
import { clamp } from '@shared/lib/math';
import { DEFAULT_ANNOTATION_TOOL_ID, isAnnotationToolId } from './annotation-tools';

/**
 * Pure state helpers for the Capture & Annotate tool (spec: capture_annotate_tool). No DOM
 * access, so sanitization, file naming and timestamp formatting are unit-testable.
 */

export const MIN_STROKE_WIDTH_PX = 1;
export const MAX_STROKE_WIDTH_PX = 12;
export const DEFAULT_STROKE_WIDTH_PX = 4;

/** Red reads on almost any page, which is why it is THE annotation default everywhere. */
export const DEFAULT_ANNOTATION_COLOR = '#EF4444';

/** Editor palette: high-contrast marks first, page-matching neutrals last. */
export const ANNOTATION_COLORS: readonly string[] = [
  DEFAULT_ANNOTATION_COLOR,
  '#F97316',
  '#EAB308',
  '#22C55E',
  '#3B82F6',
  '#F4F4F5',
];

/** Stroke width presets offered by the editor (thin / regular / bold). */
export const STROKE_WIDTH_PRESETS_PX: readonly number[] = [2, DEFAULT_STROKE_WIDTH_PX, 7];

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function createDefaultCaptureAnnotateState(): CaptureAnnotateState {
  return {
    toolId: DEFAULT_ANNOTATION_TOOL_ID,
    color: DEFAULT_ANNOTATION_COLOR,
    strokeWidthPx: DEFAULT_STROKE_WIDTH_PX,
  };
}

/** Repairs malformed persisted values; unknown tool ids fall back to the default tool. */
export function sanitizeCaptureAnnotateState(state: CaptureAnnotateState): CaptureAnnotateState {
  return {
    toolId:
      typeof state.toolId === 'string' && isAnnotationToolId(state.toolId)
        ? state.toolId
        : DEFAULT_ANNOTATION_TOOL_ID,
    color:
      typeof state.color === 'string' && HEX_COLOR_PATTERN.test(state.color)
        ? state.color
        : DEFAULT_ANNOTATION_COLOR,
    strokeWidthPx: Number.isFinite(state.strokeWidthPx)
      ? clamp(Math.round(state.strokeWidthPx), MIN_STROKE_WIDTH_PX, MAX_STROKE_WIDTH_PX)
      : DEFAULT_STROKE_WIDTH_PX,
  };
}

/**
 * Download filename for an exported capture: host + timestamp, e.g.
 * `pixly-capture-example-com-20260730-140509.png`. The date is injected so the builder stays pure.
 */
export function buildCaptureFileName(href: string, date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;

  return `pixly-capture-${fileNameSlug(href)}-${stamp}.png`;
}

/** Host reduced to filename-safe characters; unparseable hrefs degrade to a generic slug. */
function fileNameSlug(href: string): string {
  let host: string;

  try {
    host = new URL(href).hostname;
  } catch {
    return 'page';
  }

  const slug = host
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'page';
}

/** "2026-07-30 14:05" in local time, from an ISO timestamp; empty for unparseable input. */
export function formatCapturedAt(iso: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const pad = (value: number): string => String(value).padStart(2, '0');

  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}
