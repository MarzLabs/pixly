import { describe, expect, it } from 'vitest';
import { TOOL_ID } from '@shared/constants';
import {
  activateTool,
  createEmptyConfig,
  deactivateTool,
  getActiveToolIds,
  getToolState,
  isToolActive,
  setGlobalEnabled,
  updateToolState,
} from '@shared/persistence/config-document';
import { createDefaultOverlayState } from '@content/tools/image-overlay/overlay-geometry';
import { DEFAULT_MIN_SIZE_PX } from '@content/tools/fix-broken-images/detection';

const ORIGIN_A = 'https://site-a.com';
const ORIGIN_B = 'https://site-b.com';

describe('config document persistence by scope', () => {
  it('activates a tool for one scope without affecting another (site isolation, RF-ACT-3)', () => {
    // Arrange.
    const initial = createEmptyConfig();

    // Act.
    const config = activateTool(initial, ORIGIN_A, TOOL_ID.fixBrokenImages, {
      minSizePx: DEFAULT_MIN_SIZE_PX,
    });

    // Assert.
    expect(isToolActive(config, ORIGIN_A, TOOL_ID.fixBrokenImages)).toBe(true);
    expect(isToolActive(config, ORIGIN_B, TOOL_ID.fixBrokenImages)).toBe(false);
  });

  it('does not mutate the input config (immutability)', () => {
    // Arrange.
    const initial = createEmptyConfig();

    // Act.
    activateTool(initial, ORIGIN_A, TOOL_ID.fixBrokenImages, { minSizePx: DEFAULT_MIN_SIZE_PX });

    // Assert.
    expect(initial.scopes).toEqual({});
  });

  it('restores the exact persisted state for a scope (RF-ACT-4)', () => {
    // Arrange.
    const overlayState = { ...createDefaultOverlayState(), opacity: 0.33, offsetX: 120, offsetY: -40 };
    let config = activateTool(createEmptyConfig(), ORIGIN_A, TOOL_ID.imageOverlay, createDefaultOverlayState());

    // Act.
    config = updateToolState(config, ORIGIN_A, TOOL_ID.imageOverlay, overlayState);
    const restored = getToolState(config, ORIGIN_A, TOOL_ID.imageOverlay);

    // Assert.
    expect(restored).toEqual(overlayState);
  });

  it('keeps activation idempotent (no duplicate ids)', () => {
    // Arrange.
    let config = activateTool(createEmptyConfig(), ORIGIN_A, TOOL_ID.fixBrokenImages, {
      minSizePx: DEFAULT_MIN_SIZE_PX,
    });

    // Act.
    config = activateTool(config, ORIGIN_A, TOOL_ID.fixBrokenImages, { minSizePx: DEFAULT_MIN_SIZE_PX });

    // Assert.
    expect(getActiveToolIds(config, ORIGIN_A)).toEqual([TOOL_ID.fixBrokenImages]);
  });

  it('removes the scope entirely when its last tool is deactivated', () => {
    // Arrange.
    let config = activateTool(createEmptyConfig(), ORIGIN_A, TOOL_ID.fixBrokenImages, {
      minSizePx: DEFAULT_MIN_SIZE_PX,
    });

    // Act.
    config = deactivateTool(config, ORIGIN_A, TOOL_ID.fixBrokenImages);

    // Assert.
    expect(config.scopes[ORIGIN_A]).toBeUndefined();
    expect(isToolActive(config, ORIGIN_A, TOOL_ID.fixBrokenImages)).toBe(false);
  });

  it('preserves other active tools when one is deactivated', () => {
    // Arrange.
    let config = activateTool(createEmptyConfig(), ORIGIN_A, TOOL_ID.fixBrokenImages, {
      minSizePx: DEFAULT_MIN_SIZE_PX,
    });
    config = activateTool(config, ORIGIN_A, TOOL_ID.imageOverlay, createDefaultOverlayState());

    // Act.
    config = deactivateTool(config, ORIGIN_A, TOOL_ID.fixBrokenImages);

    // Assert.
    expect(getActiveToolIds(config, ORIGIN_A)).toEqual([TOOL_ID.imageOverlay]);
  });

  it('toggles the global enabled flag without touching scopes', () => {
    // Arrange.
    const config = activateTool(createEmptyConfig(), ORIGIN_A, TOOL_ID.fixBrokenImages, {
      minSizePx: DEFAULT_MIN_SIZE_PX,
    });

    // Act.
    const disabled = setGlobalEnabled(config, false);

    // Assert.
    expect(disabled.globalEnabled).toBe(false);
    expect(isToolActive(disabled, ORIGIN_A, TOOL_ID.fixBrokenImages)).toBe(true);
  });
});
