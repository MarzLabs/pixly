import { clamp } from '@shared/lib/math';
import { requestCapture, waitForPaintedFrame } from './capture-client';
import { MAX_STITCH_DEVICE_HEIGHT_PX, planScrollCapture, sliceDeviceOffsetY } from './scroll-plan';

/**
 * Full-page (scroll & stitch) capture for the Capture & Annotate tool. The document's scrolling
 * element is walked viewport by viewport; every stop is photographed via the service worker
 * (captureVisibleTab only sees the visible viewport) and painted into one tall canvas at its
 * scroll offset. Scroll position and any suppressed page chrome are restored no matter how the
 * run ends. Pages that scroll inside a nested container (not the document) degrade to a plain
 * viewport capture — the plan collapses to a single slice.
 */

/** captureVisibleTab is quota-limited (~2 calls/sec); spacing the slices avoids quota errors. */
const CAPTURE_INTERVAL_MS = 600;
/** Post-scroll settle time so lazy-loaded content and scroll-linked effects can paint. */
const SETTLE_DELAY_MS = 200;
/** One retry per slice (quota errors are transient); the wait lets the quota window refill. */
const RETRY_DELAY_MS = 1000;

export type FullPageCaptureResult =
  | { ok: true; bitmap: ImageBitmap; truncated: boolean }
  | { ok: false; error: string };

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * Repeating page chrome would smear across every slice, so: fixed elements (floating headers,
 * FABs, cookie bars) are hidden from the second slice on — the first slice keeps them, like a
 * normal screenshot — and sticky elements are pinned to their in-flow position for the whole
 * run (position: static lays out identically to an unstuck sticky, so they appear exactly once,
 * at home). Everything is restored from the recorded inline styles afterwards.
 */
function createPageChromeSuppressor(): {
  unstick(): void;
  hideFixed(): void;
  restore(): void;
} {
  const fixed: { element: HTMLElement; visibility: string }[] = [];
  const sticky: { element: HTMLElement; position: string }[] = [];

  for (const element of Array.from(document.body?.querySelectorAll<HTMLElement>('*') ?? [])) {
    const position = getComputedStyle(element).position;

    if (position === 'fixed') {
      fixed.push({ element, visibility: element.style.visibility });
    } else if (position === 'sticky') {
      sticky.push({ element, position: element.style.position });
    }
  }

  return {
    unstick(): void {
      for (const entry of sticky) {
        entry.element.style.position = 'static';
      }
    },
    hideFixed(): void {
      for (const entry of fixed) {
        entry.element.style.visibility = 'hidden';
      }
    },
    restore(): void {
      for (const entry of sticky) {
        entry.element.style.position = entry.position;
      }

      for (const entry of fixed) {
        entry.element.style.visibility = entry.visibility;
      }
    },
  };
}

/**
 * Scrolls through the page capturing viewport slices and stitches them into one tall bitmap.
 * `isAborted` is polled between async steps (the owner deactivating mid-run); an aborted run
 * restores the page and resolves null — there is nothing to show.
 */
export async function captureFullPage(
  isAborted: () => boolean,
): Promise<FullPageCaptureResult | null> {
  const scroller = document.scrollingElement ?? document.documentElement;
  const viewportHeight = window.innerHeight;
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const plan = planScrollCapture(viewportHeight, scroller.scrollHeight, dpr);

  // A single-slice plan is just a viewport capture; leave the page's chrome untouched.
  const suppressor = plan.scrollTops.length > 1 ? createPageChromeSuppressor() : null;
  suppressor?.unstick();

  const originalScrollTop = scroller.scrollTop;
  let canvas: OffscreenCanvas | null = null;
  let ctx: OffscreenCanvasRenderingContext2D | null = null;
  let deviceScale = dpr;
  let lastCaptureAt = Number.NEGATIVE_INFINITY;

  try {
    for (const [index, scrollTop] of plan.scrollTops.entries()) {
      if (isAborted()) {
        return null;
      }

      scroller.scrollTo({ top: scrollTop, behavior: 'instant' });

      // Fixed chrome appears once (in the first slice) instead of repeating on every stop.
      if (index === 1) {
        suppressor?.hideFixed();
      }

      await waitForPaintedFrame();
      await delay(
        Math.max(SETTLE_DELAY_MS, CAPTURE_INTERVAL_MS - (performance.now() - lastCaptureAt)),
      );

      if (isAborted()) {
        return null;
      }

      // Read AFTER settling: the browser may have clamped or nudged the requested offset.
      const achievedTop = scroller.scrollTop;
      lastCaptureAt = performance.now();
      let reply = await requestCapture();

      if (!reply.ok) {
        await delay(RETRY_DELAY_MS);
        lastCaptureAt = performance.now();
        reply = await requestCapture();
      }

      if (!reply.ok) {
        return { ok: false, error: reply.error };
      }

      const slice = await createImageBitmap(await (await fetch(reply.dataUrl)).blob());

      if (!canvas) {
        // The first slice defines the real capture scale (browser zoom included), so the
        // stitched canvas is sized from it rather than trusting devicePixelRatio alone.
        deviceScale = viewportHeight > 0 ? slice.height / viewportHeight : dpr;
        canvas = new OffscreenCanvas(
          slice.width,
          clamp(
            Math.round(plan.totalCssHeight * deviceScale),
            slice.height,
            Math.max(slice.height, MAX_STITCH_DEVICE_HEIGHT_PX),
          ),
        );
        ctx = canvas.getContext('2d');
      }

      if (!ctx) {
        slice.close();

        return { ok: false, error: 'Canvas 2D unavailable' };
      }

      ctx.drawImage(
        slice,
        0,
        sliceDeviceOffsetY(achievedTop, deviceScale, slice.height, canvas.height),
      );
      slice.close();
    }

    return canvas
      ? { ok: true, bitmap: canvas.transferToImageBitmap(), truncated: plan.truncated }
      : { ok: false, error: 'Nothing captured' };
  } finally {
    suppressor?.restore();
    scroller.scrollTo({ top: originalScrollTop, behavior: 'instant' });
  }
}
