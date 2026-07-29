import { describe, expect, it } from 'vitest';
import { SHADOW_HOST_ID } from '@shared/constants';
import {
  buildOutlineCss,
  createDefaultGlobalOutlinesState,
  DEFAULT_OUTLINE_WIDTH_PX,
  DEPTH_PALETTE,
  depthColor,
  MAX_DEPTH_LEVELS,
  sanitizeGlobalOutlinesState,
  SINGLE_MODE_COLOR,
} from '@content/tools/global-outlines/outline-css';

const CUSTOM_WIDTH_PX = 3;

describe('global outlines default state', () => {
  it('starts with a 1px depth-colored outline', () => {
    // Arrange / Act.
    const state = createDefaultGlobalOutlinesState();

    // Assert.
    expect(state).toEqual({ widthPx: DEFAULT_OUTLINE_WIDTH_PX, colorMode: 'by-depth' });
  });
});

describe('global outlines state sanitization', () => {
  it('repairs a non-positive or non-finite width to the default', () => {
    // Arrange / Act / Assert.
    expect(sanitizeGlobalOutlinesState({ widthPx: 0, colorMode: 'single' }).widthPx).toBe(
      DEFAULT_OUTLINE_WIDTH_PX,
    );
    expect(sanitizeGlobalOutlinesState({ widthPx: Number.NaN, colorMode: 'single' }).widthPx).toBe(
      DEFAULT_OUTLINE_WIDTH_PX,
    );
  });

  it('repairs an unknown color mode to by-depth', () => {
    // Arrange.
    const state = { widthPx: CUSTOM_WIDTH_PX, colorMode: 'rainbow' as never };

    // Act / Assert.
    expect(sanitizeGlobalOutlinesState(state).colorMode).toBe('by-depth');
  });

  it('rounds fractional widths', () => {
    // Arrange / Act / Assert.
    expect(sanitizeGlobalOutlinesState({ widthPx: 2.6, colorMode: 'single' }).widthPx).toBe(3);
  });
});

describe('single color mode stylesheet', () => {
  it('outlines everything with one color at the configured width', () => {
    // Arrange / Act.
    const css = buildOutlineCss({ widthPx: CUSTOM_WIDTH_PX, colorMode: 'single' });

    // Assert.
    expect(css).toContain(
      `* { outline: ${CUSTOM_WIDTH_PX}px solid ${SINGLE_MODE_COLOR} !important; }`,
    );
  });

  it('wins over page outline resets via !important', () => {
    // Arrange / Act.
    const css = buildOutlineCss({ widthPx: DEFAULT_OUTLINE_WIDTH_PX, colorMode: 'single' });

    // Assert.
    expect(css).toContain('!important');
  });
});

describe('depth color mode stylesheet', () => {
  it('emits one color rule per nesting level up to the cap', () => {
    // Arrange / Act.
    const css = buildOutlineCss({ widthPx: DEFAULT_OUTLINE_WIDTH_PX, colorMode: 'by-depth' });
    const colorRules = css.split('\n').filter((line) => line.includes('outline-color'));

    // Assert: level 1 sets the full outline; levels 2..MAX add color overrides.
    expect(colorRules).toHaveLength(MAX_DEPTH_LEVELS - 1);
  });

  it('orders rules shallow-to-deep so the deepest match wins the cascade', () => {
    // Arrange / Act.
    const css = buildOutlineCss({ widthPx: DEFAULT_OUTLINE_WIDTH_PX, colorMode: 'by-depth' });
    const depthTwoIndex = css.indexOf('* *');
    const depthThreeIndex = css.indexOf('* * *');

    // Assert.
    expect(depthTwoIndex).toBeGreaterThan(-1);
    expect(depthThreeIndex).toBeGreaterThan(depthTwoIndex);
  });

  it('cycles the palette once levels exceed its size', () => {
    // Arrange / Act / Assert.
    expect(depthColor(1)).toBe(DEPTH_PALETTE[0]);
    expect(depthColor(DEPTH_PALETTE.length + 1)).toBe(DEPTH_PALETTE[0]);
    expect(depthColor(DEPTH_PALETTE.length + 2)).toBe(DEPTH_PALETTE[1]);
  });
});

describe('shadow host exclusion', () => {
  it('never outlines the Pixly shadow host, in either mode', () => {
    // Arrange.
    const exclusionRule = `#${SHADOW_HOST_ID} { outline: none !important; }`;

    // Act / Assert.
    expect(buildOutlineCss({ widthPx: 1, colorMode: 'single' })).toContain(exclusionRule);
    expect(buildOutlineCss({ widthPx: 1, colorMode: 'by-depth' })).toContain(exclusionRule);
  });
});
