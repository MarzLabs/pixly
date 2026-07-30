import type { SnapshotState } from '@shared/types';
import { isBlendMode } from '@shared/types';
import { clamp } from '@shared/lib/math';

/**
 * Pure state helpers for the Snapshot & Compare tool (spec: snapshot_compare_tool). No DOM
 * access, so sanitization, key building and timestamp formatting are unit-testable.
 */

export const MIN_SNAPSHOT_OPACITY = 0.05;
export const MAX_SNAPSHOT_OPACITY = 1;
export const DEFAULT_SNAPSHOT_OPACITY = 1;

/** `difference` turns identical pixels black, so changes glow — THE compare mode. */
export const DEFAULT_SNAPSHOT_BLEND = 'difference' as const;

const IMAGE_KEY_PREFIX = 'snapshot';

export function createDefaultSnapshotState(): SnapshotState {
  return {
    imageKey: null,
    capturedAtIso: null,
    pageTitle: null,
    pageUrl: null,
    offsetX: 0,
    offsetY: 0,
    widthPx: 0,
    heightPx: 0,
    opacity: DEFAULT_SNAPSHOT_OPACITY,
    blendMode: DEFAULT_SNAPSHOT_BLEND,
    hidden: false,
  };
}

/** Repairs malformed persisted values; a snapshot without a usable key degrades to "no capture". */
export function sanitizeSnapshotState(state: SnapshotState): SnapshotState {
  const hasCapture = typeof state.imageKey === 'string' && state.imageKey.length > 0;

  return {
    imageKey: hasCapture ? state.imageKey : null,
    capturedAtIso:
      hasCapture && typeof state.capturedAtIso === 'string' ? state.capturedAtIso : null,
    pageTitle: hasCapture && typeof state.pageTitle === 'string' ? state.pageTitle : null,
    pageUrl: hasCapture && typeof state.pageUrl === 'string' ? state.pageUrl : null,
    offsetX: nonNegativeInteger(state.offsetX),
    offsetY: nonNegativeInteger(state.offsetY),
    widthPx: nonNegativeInteger(state.widthPx),
    heightPx: nonNegativeInteger(state.heightPx),
    opacity: Number.isFinite(state.opacity)
      ? clamp(state.opacity, MIN_SNAPSHOT_OPACITY, MAX_SNAPSHOT_OPACITY)
      : DEFAULT_SNAPSHOT_OPACITY,
    blendMode: isBlendMode(state.blendMode) ? state.blendMode : DEFAULT_SNAPSHOT_BLEND,
    hidden: state.hidden === true,
  };
}

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/** IndexedDB key for a capture; timestamped so retakes never collide with the previous binary. */
export function buildSnapshotImageKey(href: string, timestampMs: number): string {
  return `${IMAGE_KEY_PREFIX}-${href}-${timestampMs}`;
}

/** "2026-07-29 14:05" in local time, from an ISO timestamp; empty for unparseable input. */
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
