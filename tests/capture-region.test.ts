import { describe, expect, it } from 'vitest';
import {
  clampRegionToViewport,
  isViableRegion,
  MIN_REGION_SIZE_PX,
  regionToDeviceCrop,
} from '@content/tools/capture-annotate/capture-region';

describe('isViableRegion', () => {
  it('accepts regions at least the minimum on both sides', () => {
    expect(
      isViableRegion({ left: 0, top: 0, width: MIN_REGION_SIZE_PX, height: MIN_REGION_SIZE_PX }),
    ).toBe(true);
  });

  it('rejects slipped clicks (tiny on either side)', () => {
    expect(isViableRegion({ left: 0, top: 0, width: 2, height: 100 })).toBe(false);
    expect(isViableRegion({ left: 0, top: 0, width: 100, height: 2 })).toBe(false);
  });
});

describe('clampRegionToViewport', () => {
  it('passes a fully-visible region through unchanged', () => {
    const region = { left: 10, top: 20, width: 100, height: 50 };

    expect(clampRegionToViewport(region, 800, 600)).toEqual(region);
  });

  it('clips element rects that overflow the viewport (tall sections)', () => {
    expect(
      clampRegionToViewport({ left: -50, top: 400, width: 900, height: 1000 }, 800, 600),
    ).toEqual({ left: 0, top: 400, width: 800, height: 200 });
  });

  it('collapses a fully offscreen region to zero size', () => {
    const clamped = clampRegionToViewport({ left: 900, top: 700, width: 50, height: 50 }, 800, 600);

    expect(clamped.width).toBe(0);
    expect(clamped.height).toBe(0);
  });
});

describe('regionToDeviceCrop', () => {
  it('scales the CSS region by the devicePixelRatio', () => {
    expect(
      regionToDeviceCrop({ left: 10, top: 20, width: 100, height: 50 }, 2, 1600, 1200),
    ).toEqual({ sx: 20, sy: 40, sw: 200, sh: 100 });
  });

  it('clamps the crop to the real bitmap dimensions', () => {
    expect(
      regionToDeviceCrop({ left: 700, top: 500, width: 200, height: 200 }, 1, 800, 600),
    ).toEqual({ sx: 700, sy: 500, sw: 100, sh: 100 });
  });

  it('returns null when the region falls entirely outside the bitmap', () => {
    expect(regionToDeviceCrop({ left: 900, top: 0, width: 50, height: 50 }, 1, 800, 600)).toBe(
      null,
    );
  });

  it('treats a non-positive ratio as 1 instead of collapsing the crop', () => {
    expect(regionToDeviceCrop({ left: 0, top: 0, width: 100, height: 100 }, 0, 800, 600)).toEqual({
      sx: 0,
      sy: 0,
      sw: 100,
      sh: 100,
    });
  });
});
