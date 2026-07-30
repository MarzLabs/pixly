import { h, Fragment } from 'preact';
import { TOOL_ID } from '@shared/constants';
import type { CaptureAnnotateState } from '@shared/types';
import type { CaptureReply } from '@shared/messaging/messages';
import type { Tool, ToolContext } from '@content/core/tool';
import { AnnotationEditor } from './annotation-editor';
import type { EditorStyleSelection } from './annotation-editor';
import {
  createDefaultCaptureAnnotateState,
  sanitizeCaptureAnnotateState,
} from './capture-annotate-state';
import { requestCapture, waitForPaintedFrame } from './capture-client';
import type { CaptureRegion, RegionPick } from './capture-region';
import { isViableRegion, regionToDeviceCrop } from './capture-region';
import { pickElementRegion } from './element-picker';
import { selectRegion } from './region-selector';

/** What the capture photographs: the full view, a dragged area, or a picked element's box. */
export type CaptureMode = 'view' | 'area' | 'element';

/**
 * Capture & Annotate (spec: capture_annotate_tool). Scope `origin`. Captures the visible
 * viewport, a dragged area of it, or a single element's box (via the service worker, like
 * Snapshot & Compare — scoped modes crop the viewport PNG) and opens a full-screen editor to
 * draw arrows, lines, rectangles, ellipses, text labels and emoji stamps over it. The exported
 * PNG embeds the page title, URL and capture time in a provenance banner, so a shared capture
 * always says where it came from. Only the drawing style defaults persist; annotations leave
 * through the export.
 */
export class CaptureAnnotateTool implements Tool<'capture-annotate'> {
  readonly id = TOOL_ID.captureAnnotate;
  readonly name = 'Capture & Annotate';
  readonly description = 'Capture the page, an area or an element and annotate it for sharing.';
  readonly icon =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 15l6-6"/><path d="M10 9h4v4"/></svg>';
  readonly scope = 'origin' as const;

  private state: CaptureAnnotateState = this.defaultState();
  private context: ToolContext | null = null;
  private editor: AnnotationEditor | null = null;
  private feedback: { message: string; isError: boolean } | null = null;
  private capturing = false;
  /** Running picker overlay, kept so deactivation can tear it down; null while not picking. */
  private activePick: RegionPick | null = null;

  // The tool receives its ToolContext through activate(); no constructor-time context is needed.
  constructor(_contextProvider: () => ToolContext) {}

  defaultState(): CaptureAnnotateState {
    return createDefaultCaptureAnnotateState();
  }

  activate(context: ToolContext, state: CaptureAnnotateState): void {
    this.context = context;
    this.state = sanitizeCaptureAnnotateState(state);
  }

  deactivate(): void {
    // A pending pick would otherwise leave its overlay blocking the page forever.
    this.activePick?.cancel();
    this.closeEditor();
    this.context = null;
    this.feedback = null;
  }

  serializeState(): CaptureAnnotateState {
    return { ...this.state };
  }

  /** Applies externally-edited persisted state (e.g. from another tab on the same origin) live. */
  restoreState(state: CaptureAnnotateState): void {
    this.state = sanitizeCaptureAnnotateState(state);
    this.editor?.setSelection({ ...this.state });
  }

  renderControls() {
    const busy = this.capturing || this.activePick !== null || this.editor !== null;

    return h(Fragment, null, [
      h('div', { key: 'capture', className: 'pixly-control' }, [
        h('label', { key: 'l', className: 'pixly-control__label' }, [
          h('span', { key: 't' }, 'Capture'),
        ]),
        h('div', { key: 'r', className: 'pixly-control__row' }, [
          h(
            'button',
            {
              key: 'view',
              className: 'pixly-btn pixly-btn--primary',
              disabled: busy,
              title: 'Capture the full visible viewport',
              onClick: () => void this.captureAndEdit('view'),
            },
            this.capturing ? 'Capturing…' : this.editor ? 'Editing…' : 'View',
          ),
          h(
            'button',
            {
              key: 'area',
              className: 'pixly-btn',
              disabled: busy,
              title: 'Drag to select the area to capture',
              onClick: () => void this.captureAndEdit('area'),
            },
            'Area',
          ),
          h(
            'button',
            {
              key: 'element',
              className: 'pixly-btn',
              disabled: busy,
              title: 'Click a page element to capture its box',
              onClick: () => void this.captureAndEdit('element'),
            },
            'Element',
          ),
        ]),
      ]),
      this.renderFeedback(),
      h(
        'p',
        { key: 'hint', className: 'pixly-feedback' },
        'Draw arrows, shapes, text and emoji on the capture, then download or copy it. ' +
          'The exported PNG embeds the page title and URL.',
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

  /**
   * Full capture round trip. Scoped modes first run their picker overlay (drag marquee or
   * element highlight) to select a viewport region; then Pixly's own UI is hidden, a painted
   * frame is awaited, the service worker returns the visible-tab PNG (scoped modes crop it to
   * the region), and the annotation editor opens on the decoded bitmap.
   */
  private async captureAndEdit(mode: CaptureMode): Promise<void> {
    if (this.capturing || this.activePick || this.editor || !this.context) {
      return;
    }

    const layer = this.context.shadowRoot.querySelector<HTMLElement>('.pixly-layer');

    if (!layer) {
      this.setFeedback('Pixly UI layer missing; cannot capture.', true);

      return;
    }

    let region: CaptureRegion | null = null;

    if (mode !== 'view') {
      this.setFeedback(
        mode === 'area' ? 'Drag to select the area…' : 'Click the element to capture…',
        false,
      );

      const pick = mode === 'area' ? selectRegion(layer) : pickElementRegion(layer);
      this.activePick = pick;

      try {
        region = await pick.result;
      } finally {
        this.activePick = null;
      }

      // Deactivation cancelled the pick and dropped the context; do not continue capturing.
      if (!this.context) {
        return;
      }

      if (!region) {
        this.setFeedback('Capture cancelled.', false);

        return;
      }

      if (!isViableRegion(region)) {
        this.setFeedback('Selection too small — drag a larger area.', true);

        return;
      }
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
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    let bitmap = await createImageBitmap(blob);

    // Scoped modes keep only the selected region of the viewport PNG. An unmappable region
    // (e.g. resized viewport between pick and capture) degrades to the full capture.
    if (region) {
      const crop = regionToDeviceCrop(region, dpr, bitmap.width, bitmap.height);

      if (crop) {
        const cropped = await createImageBitmap(bitmap, crop.sx, crop.sy, crop.sw, crop.sh);
        bitmap.close();
        bitmap = cropped;
      }
    }

    this.editor = new AnnotationEditor(
      layer,
      {
        bitmap,
        dpr,
        title: document.title || '',
        url: this.context.href,
        capturedAtIso: new Date().toISOString(),
      },
      { ...this.state },
      {
        onStyleChange: (selection: EditorStyleSelection) => this.persistSelection(selection),
        onClose: () => {
          this.closeEditor();
          this.setFeedback('Capture closed.', false);
        },
      },
    );

    this.setFeedback('Capture ready — annotate away.', false);
  }

  /** The editor's style picks become the persisted defaults for the next session. */
  private persistSelection(selection: EditorStyleSelection): void {
    this.state = sanitizeCaptureAnnotateState({ ...this.state, ...selection });
    this.context?.persistState();
  }

  private closeEditor(): void {
    this.editor?.destroy();
    this.editor = null;
    this.context?.requestControlsRefresh();
  }

  private setFeedback(message: string, isError: boolean): void {
    this.feedback = { message, isError };
    this.context?.requestControlsRefresh();
  }
}
