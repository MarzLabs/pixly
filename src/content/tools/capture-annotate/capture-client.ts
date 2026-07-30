import type { CaptureReply, ContentToBackgroundMessage } from '@shared/messaging/messages';

/**
 * Capture round-trip helpers for the Capture & Annotate tool. Kept inside the tool folder (not
 * shared with Snapshot & Compare) so each capture tool stays self-contained per the architecture
 * rule that tools never depend on each other.
 */

/** Two rAFs guarantee the hidden-UI frame actually painted before the capture is taken. */
export function waitForPaintedFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

/** Asks the service worker for the visible-tab PNG (captureVisibleTab is extension-context only). */
export function requestCapture(): Promise<CaptureReply> {
  const message: ContentToBackgroundMessage = { type: 'pixly/capture-visible-tab' };

  return chrome.runtime.sendMessage(message).then(
    (reply: CaptureReply | undefined) =>
      reply ?? { ok: false, error: 'No reply from the service worker' },
    (error: unknown) => ({
      ok: false,
      error: error instanceof Error ? error.message : 'Service worker unreachable',
    }),
  );
}
