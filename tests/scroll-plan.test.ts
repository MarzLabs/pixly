import { describe, expect, it } from 'vitest';
import {
  MAX_STITCH_DEVICE_HEIGHT_PX,
  planScrollCapture,
  sliceDeviceOffsetY,
} from '@content/tools/capture-annotate/scroll-plan';

describe('planScrollCapture', () => {
  it('captures a page that fits the viewport as a single slice', () => {
    expect(planScrollCapture(600, 500, 1)).toEqual({
      scrollTops: [0],
      totalCssHeight: 600,
      truncated: false,
    });
  });

  it('steps by viewport height with the last slice flush to the page bottom', () => {
    expect(planScrollCapture(600, 1500, 1)).toEqual({
      scrollTops: [0, 600, 900],
      totalCssHeight: 1500,
      truncated: false,
    });
  });

  it('does not duplicate the final stop when the page is an exact multiple', () => {
    expect(planScrollCapture(600, 1800, 1).scrollTops).toEqual([0, 600, 1200]);
  });

  it('adds a short final step for pages barely taller than the viewport', () => {
    expect(planScrollCapture(600, 610, 1).scrollTops).toEqual([0, 10]);
  });

  it('truncates pages taller than the device-pixel cap, scaled by the ratio', () => {
    const plan = planScrollCapture(600, 100000, 2);

    expect(plan.truncated).toBe(true);
    expect(plan.totalCssHeight).toBe(Math.floor(MAX_STITCH_DEVICE_HEIGHT_PX / 2));
    expect(plan.scrollTops.at(-1)).toBe(plan.totalCssHeight - 600);
  });

  it('reports full coverage at exactly the cap', () => {
    const plan = planScrollCapture(600, MAX_STITCH_DEVICE_HEIGHT_PX, 1);

    expect(plan.truncated).toBe(false);
    expect(plan.totalCssHeight).toBe(MAX_STITCH_DEVICE_HEIGHT_PX);
  });

  it('treats a non-positive devicePixelRatio as 1', () => {
    expect(planScrollCapture(600, 1500, 0)).toEqual(planScrollCapture(600, 1500, 1));
  });

  it('never plans past the cap: every slice fits inside the stitched height', () => {
    const plan = planScrollCapture(700, 50000, 1.5, 4096);
    const last = plan.scrollTops.at(-1) ?? 0;

    expect(plan.truncated).toBe(true);
    expect(last + 700).toBe(plan.totalCssHeight);
    expect(plan.scrollTops).toEqual([...plan.scrollTops].sort((a, b) => a - b));
  });
});

describe('sliceDeviceOffsetY', () => {
  it('scales the achieved scroll offset by the device scale', () => {
    expect(sliceDeviceOffsetY(600, 2, 1200, 3600)).toBe(1200);
  });

  it('clamps the last slice against the canvas bottom instead of overshooting', () => {
    expect(sliceDeviceOffsetY(1200, 2, 1200, 3000)).toBe(1800);
  });

  it('never returns a negative offset', () => {
    expect(sliceDeviceOffsetY(-5, 2, 600, 1200)).toBe(0);
    expect(sliceDeviceOffsetY(100, 1, 2000, 1200)).toBe(0);
  });

  it('treats a non-positive scale as 1 instead of collapsing the offset', () => {
    expect(sliceDeviceOffsetY(600, 0, 600, 1800)).toBe(600);
  });
});
