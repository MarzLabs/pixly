import { describe, expect, it } from 'vitest';
import type { SnapshotState } from '@shared/types';
import {
  buildSnapshotImageKey,
  createDefaultSnapshotState,
  DEFAULT_SNAPSHOT_BLEND,
  DEFAULT_SNAPSHOT_OPACITY,
  formatCapturedAt,
  MAX_SNAPSHOT_OPACITY,
  MIN_SNAPSHOT_OPACITY,
  sanitizeSnapshotState,
} from '@content/tools/snapshot-compare/snapshot-state';

const CAPTURE_URL = 'https://site-a.com/page';
const CAPTURE_TIMESTAMP_MS = 1753800000000;

function capturedState(): SnapshotState {
  return {
    ...createDefaultSnapshotState(),
    imageKey: buildSnapshotImageKey(CAPTURE_URL, CAPTURE_TIMESTAMP_MS),
    capturedAtIso: '2026-07-29T14:00:00.000Z',
    pageTitle: 'Example page',
    pageUrl: CAPTURE_URL,
    widthPx: 1280,
    heightPx: 800,
  };
}

describe('snapshot default state', () => {
  it('starts without a capture, fully opaque, in difference blend', () => {
    // Arrange / Act.
    const state = createDefaultSnapshotState();

    // Assert.
    expect(state.imageKey).toBeNull();
    expect(state.capturedAtIso).toBeNull();
    expect(state.pageTitle).toBeNull();
    expect(state.pageUrl).toBeNull();
    expect(state.opacity).toBe(DEFAULT_SNAPSHOT_OPACITY);
    expect(state.blendMode).toBe(DEFAULT_SNAPSHOT_BLEND);
    expect(state.hidden).toBe(false);
  });
});

describe('snapshot state sanitization', () => {
  it('keeps a valid capture intact', () => {
    // Arrange / Act / Assert.
    expect(sanitizeSnapshotState(capturedState())).toEqual(capturedState());
  });

  it('drops capture metadata when there is no image key', () => {
    // Arrange.
    const state = { ...capturedState(), imageKey: null };

    // Act.
    const sanitized = sanitizeSnapshotState(state);

    // Assert.
    expect(sanitized.capturedAtIso).toBeNull();
    expect(sanitized.pageTitle).toBeNull();
    expect(sanitized.pageUrl).toBeNull();
  });

  it('clamps opacity and repairs unknown blend modes', () => {
    // Arrange.
    const state = {
      ...capturedState(),
      opacity: 5,
      blendMode: 'plasma' as never,
    };

    // Act.
    const sanitized = sanitizeSnapshotState(state);

    // Assert.
    expect(sanitized.opacity).toBe(MAX_SNAPSHOT_OPACITY);
    expect(sanitized.blendMode).toBe(DEFAULT_SNAPSHOT_BLEND);
    expect(sanitizeSnapshotState({ ...capturedState(), opacity: 0 }).opacity).toBe(
      MIN_SNAPSHOT_OPACITY,
    );
  });

  it('repairs negative or non-finite geometry to zero', () => {
    // Arrange.
    const state = { ...capturedState(), offsetX: -10, offsetY: Number.NaN, widthPx: -1 };

    // Act.
    const sanitized = sanitizeSnapshotState(state);

    // Assert.
    expect(sanitized.offsetX).toBe(0);
    expect(sanitized.offsetY).toBe(0);
    expect(sanitized.widthPx).toBe(0);
  });
});

describe('snapshot image keys', () => {
  it('namespaces keys by page and timestamp so retakes never collide', () => {
    // Arrange / Act.
    const first = buildSnapshotImageKey(CAPTURE_URL, CAPTURE_TIMESTAMP_MS);
    const retake = buildSnapshotImageKey(CAPTURE_URL, CAPTURE_TIMESTAMP_MS + 1);

    // Assert.
    expect(first).toContain(CAPTURE_URL);
    expect(first).not.toBe(retake);
  });
});

describe('capture timestamp formatting', () => {
  it('renders local date and time with zero padding', () => {
    // Arrange: build the ISO string from local components so the assertion is TZ-independent.
    const local = new Date(2026, 6, 29, 9, 5);

    // Act / Assert.
    expect(formatCapturedAt(local.toISOString())).toBe('2026-07-29 09:05');
  });

  it('returns empty for unparseable input', () => {
    // Arrange / Act / Assert.
    expect(formatCapturedAt('not-a-date')).toBe('');
  });
});
