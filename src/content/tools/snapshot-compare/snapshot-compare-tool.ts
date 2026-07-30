import { h, Fragment } from 'preact';
import { TOOL_ID } from '@shared/constants';
import type { BlendMode, SnapshotState } from '@shared/types';
import { BLEND_MODES, isBlendMode } from '@shared/types';
import type { CaptureReply, ContentToBackgroundMessage } from '@shared/messaging/messages';
import {
  deleteOverlayImage,
  getOverlayImage,
  putOverlayImage,
} from '@shared/persistence/overlay-image-store';
import type { Tool, ToolContext } from '@content/core/tool';
import {
  buildSnapshotImageKey,
  createDefaultSnapshotState,
  formatCapturedAt,
  MAX_SNAPSHOT_OPACITY,
  MIN_SNAPSHOT_OPACITY,
  sanitizeSnapshotState,
} from './snapshot-state';
import { SnapshotNode } from './snapshot-node';

/** Factor to turn the 0..1 opacity into a UI percentage and back. */
const PERCENT_FACTOR = 100;

/**
 * Snapshot & Compare (spec: snapshot_compare_tool). Scope `url`. Captures the visible viewport
 * (via the service worker) and lays it back over the page, document-anchored at the captured
 * scroll position, defaulting to `difference` blending: identical pixels turn black, so any
 * change since the capture glows. The binary lives in IndexedDB; captures survive reloads.
 */
export class SnapshotCompareTool implements Tool<'snapshot-compare'> {
  readonly id = TOOL_ID.snapshotCompare;
  readonly name = 'Snapshot & Compare';
  readonly description = 'Capture the page and compare it against its current state.';
  readonly icon =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8a2 2 0 012-2h2l2-2h6l2 2h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><circle cx="12" cy="13" r="4"/></svg>';
  readonly scope = 'url' as const;

  private state: SnapshotState = this.defaultState();
  private node: SnapshotNode | null = null;
  private context: ToolContext | null = null;
  private feedback: { message: string; isError: boolean } | null = null;
  private capturing = false;

  // The tool receives its ToolContext through activate(); no constructor-time context is needed.
  constructor(_contextProvider: () => ToolContext) {}

  defaultState(): SnapshotState {
    return createDefaultSnapshotState();
  }

  activate(context: ToolContext, state: SnapshotState): void {
    this.context = context;
    this.state = sanitizeSnapshotState(state);

    const layer = context.shadowRoot.querySelector<HTMLElement>('.pixly-layer') ?? document.body;
    this.node = new SnapshotNode(layer, this.state);

    // Re-apply a persisted capture after reload: pull the binary from IndexedDB.
    if (this.state.imageKey) {
      void this.rehydrateImage(this.state.imageKey);
    }
  }

  deactivate(): void {
    this.node?.destroy();
    this.node = null;
    this.context = null;
    this.feedback = null;
  }

  serializeState(): SnapshotState {
    return { ...this.state };
  }

  /** Applies externally-edited persisted state (e.g. from another tab on the same page) live. */
  restoreState(state: SnapshotState): void {
    const previousKey = this.state.imageKey;
    this.state = sanitizeSnapshotState(state);
    this.node?.update(this.state);

    if (this.state.imageKey && this.state.imageKey !== previousKey) {
      void this.rehydrateImage(this.state.imageKey);
    }
  }

  renderControls() {
    const hasCapture = this.state.imageKey !== null;
    const opacityPercent = Math.round(this.state.opacity * PERCENT_FACTOR);

    return h(Fragment, null, [
      h('div', { key: 'capture', className: 'pixly-control__row' }, [
        h(
          'button',
          {
            key: 'b',
            className: 'pixly-btn pixly-btn--primary',
            disabled: this.capturing,
            onClick: () => void this.captureSnapshot(),
          },
          this.capturing ? 'Capturing…' : hasCapture ? 'Retake snapshot' : 'Capture snapshot',
        ),
      ]),
      this.renderFeedback(),
      hasCapture ? this.renderCaptureInfo() : null,
      hasCapture ? this.renderCompareControls(opacityPercent) : null,
      h(
        'p',
        { key: 'hint', className: 'pixly-feedback' },
        'Difference blend: black means identical, anything glowing changed since the capture.',
      ),
    ]);
  }

  private renderFeedback() {
    if (!this.feedback) {
      return h('div', { key: 'feedback', className: 'pixly-feedback' }, '');
    }

    return h(
      'div',
      {
        key: 'feedback',
        className: `pixly-feedback${this.feedback.isError ? ' pixly-feedback--error' : ''}`,
      },
      this.feedback.message,
    );
  }

  /** Provenance block: when, on which page (title) and at which URL the capture was taken. */
  private renderCaptureInfo() {
    const rows: Array<{ label: string; value: string }> = [
      {
        label: 'Captured',
        value: this.state.capturedAtIso ? formatCapturedAt(this.state.capturedAtIso) : '—',
      },
    ];

    if (this.state.pageTitle) {
      rows.push({ label: 'Title', value: this.state.pageTitle });
    }

    if (this.state.pageUrl) {
      rows.push({ label: 'URL', value: this.state.pageUrl });
    }

    return h(
      Fragment,
      { key: 'info' },
      rows.map((row) =>
        h('div', { key: row.label, className: 'pixly-control' }, [
          h('label', { key: 'l', className: 'pixly-control__label' }, [
            h('span', { key: 't' }, row.label),
            h('span', { key: 'v', className: 'pixly-truncate', title: row.value }, row.value),
          ]),
        ]),
      ),
    );
  }

  private renderCompareControls(opacityPercent: number) {
    return h(Fragment, { key: 'compare' }, [
      h('div', { key: 'opacity', className: 'pixly-control' }, [
        h('label', { key: 'l', className: 'pixly-control__label' }, [
          h('span', { key: 't' }, 'Opacity'),
          h('span', { key: 'v' }, `${opacityPercent}%`),
        ]),
        h('input', {
          key: 'i',
          type: 'range',
          min: MIN_SNAPSHOT_OPACITY * PERCENT_FACTOR,
          max: MAX_SNAPSHOT_OPACITY * PERCENT_FACTOR,
          value: opacityPercent,
          onInput: (event: Event) =>
            this.updateState({
              opacity: Number((event.target as HTMLInputElement).value) / PERCENT_FACTOR,
            }),
        }),
      ]),
      h('div', { key: 'blend', className: 'pixly-control' }, [
        h('label', { key: 'l', className: 'pixly-control__label' }, [
          h('span', { key: 't' }, 'Blend mode'),
        ]),
        h(
          'select',
          {
            key: 's',
            value: this.state.blendMode,
            onChange: (event: Event) => {
              const value = (event.target as HTMLSelectElement).value;

              if (isBlendMode(value)) {
                this.updateState({ blendMode: value as BlendMode });
              }
            },
          },
          BLEND_MODES.map((mode) => h('option', { key: mode, value: mode }, mode)),
        ),
      ]),
      h('div', { key: 'toggles', className: 'pixly-toggle-row' }, [
        h('label', { key: 'hide', className: 'pixly-toggle' }, [
          h('input', {
            key: 'i',
            type: 'checkbox',
            checked: this.state.hidden,
            onChange: (event: Event) =>
              this.updateState({ hidden: (event.target as HTMLInputElement).checked }),
          }),
          h('span', { key: 't' }, 'Hide'),
        ]),
      ]),
      h('div', { key: 'actions', className: 'pixly-control__row' }, [
        h(
          'button',
          {
            key: 'goto',
            className: 'pixly-btn',
            title: 'Scroll to where the snapshot was captured',
            onClick: () =>
              window.scrollTo({
                top: this.state.offsetY,
                left: this.state.offsetX,
                behavior: 'smooth',
              }),
          },
          'Go to capture',
        ),
        h(
          'button',
          {
            key: 'remove',
            className: 'pixly-btn pixly-btn--danger',
            onClick: () => void this.removeSnapshot(),
          },
          'Remove',
        ),
      ]),
    ]);
  }

  /**
   * Full capture round trip: hide Pixly's own UI, wait for a painted frame, ask the service
   * worker for the visible-tab PNG, persist it to IndexedDB, and anchor it at the current scroll.
   */
  private async captureSnapshot(): Promise<void> {
    if (this.capturing || !this.context) {
      return;
    }

    this.capturing = true;
    this.setFeedback('Capturing…', false);

    const host = this.context.shadowRoot.host as HTMLElement;
    host.style.visibility = 'hidden';

    let reply: CaptureReply;

    try {
      await waitForPaintedFrame();
      reply = await requestCapture();
    } finally {
      host.style.visibility = '';
    }

    this.capturing = false;

    if (!reply.ok) {
      // activeTab lapses on navigation; re-enabling the tool from the popup requests the
      // persistent site permission, and merely opening the popup re-grants activeTab.
      this.setFeedback(
        `Capture failed (${reply.error}). Open the Pixly popup and re-enable this tool to grant site access, then retry.`,
        true,
      );

      return;
    }

    const blob = await (await fetch(reply.dataUrl)).blob();
    const previousKey = this.state.imageKey;
    const imageKey = buildSnapshotImageKey(this.context.href, Date.now());

    // The capture spans the FULL viewport (scrollbar gutter included) at device-pixel-ratio
    // scale. Sizing the layer from the PNG's real dimensions ÷ dpr renders it 1:1 in CSS pixels;
    // stretching it to clientWidth instead would compress it and skew the comparison rightwards.
    const bitmap = await createImageBitmap(blob);
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const widthPx = Math.round(bitmap.width / dpr);
    const heightPx = Math.round(bitmap.height / dpr);
    const naturalWidth = bitmap.width;
    const naturalHeight = bitmap.height;
    bitmap.close();

    const stored = await putOverlayImage(imageKey, {
      blob,
      mimeType: blob.type,
      fileName: null,
      naturalWidth,
      naturalHeight,
    });

    if (!stored.ok) {
      this.setFeedback('Snapshot too large to persist; it will not survive reloads.', true);
    }

    if (previousKey) {
      await deleteOverlayImage(previousKey);
    }

    this.node?.setImageBlob(blob);
    this.state = {
      ...this.state,
      imageKey: stored.ok ? imageKey : null,
      capturedAtIso: new Date().toISOString(),
      pageTitle: document.title || null,
      pageUrl: this.context.href,
      offsetX: Math.round(window.scrollX),
      offsetY: Math.round(window.scrollY),
      widthPx,
      heightPx,
    };
    this.node?.update(this.state);
    this.context.persistState();

    if (stored.ok) {
      this.setFeedback('Snapshot captured.', false);
    }

    this.context.requestControlsRefresh();
  }

  private async rehydrateImage(imageKey: string): Promise<void> {
    const stored = await getOverlayImage(imageKey);

    if (stored) {
      this.node?.setImageBlob(stored.blob);

      return;
    }

    // The binary was evicted; clear the dangling key so the UI offers a fresh capture.
    this.state = { ...this.state, imageKey: null, capturedAtIso: null };
    this.node?.update(this.state);
    this.context?.persistState();
    this.context?.requestControlsRefresh();
  }

  private async removeSnapshot(): Promise<void> {
    if (this.state.imageKey) {
      await deleteOverlayImage(this.state.imageKey);
    }

    this.state = createDefaultSnapshotState();
    this.node?.clearImage();
    this.node?.update(this.state);
    this.context?.persistState();
    this.setFeedback('Snapshot removed.', false);
    this.context?.requestControlsRefresh();
  }

  private updateState(partial: Partial<SnapshotState>): void {
    this.state = sanitizeSnapshotState({ ...this.state, ...partial });
    this.node?.update(this.state);
    this.context?.persistState();
    this.context?.requestControlsRefresh();
  }

  private setFeedback(message: string, isError: boolean): void {
    this.feedback = { message, isError };
    this.context?.requestControlsRefresh();
  }
}

/** Two rAFs guarantee the hidden-UI frame actually painted before the capture is taken. */
function waitForPaintedFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function requestCapture(): Promise<CaptureReply> {
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
