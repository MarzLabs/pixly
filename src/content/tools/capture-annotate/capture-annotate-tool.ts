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
import type { FullPageCaptureResult } from './scroll-capture';
import { captureFullPage } from './scroll-capture';

/**
 * What the capture photographs: the full view, the whole page (scroll & stitch), a dragged
 * area, or a picked element's box.
 */
export type CaptureMode = 'view' | 'page' | 'area' | 'element';

/**
 * Capture & Annotate (specs: capture_annotate_tool, full_page_capture). Scope `origin`.
 * Captures the visible viewport, the full page (scrolled viewport by viewport and stitched into
 * one tall bitmap), a dragged area, or a single element's box (via the service worker, like
 * Snapshot & Compare — scoped modes crop the viewport PNG) and opens a full-screen editor to
 * draw arrows, lines, rectangles, ellipses, text labels and emoji stamps over it. The exported
 * PNG embeds the page title, URL and capture time in a provenance banner, so a shared capture
 * always says where it came from. Only the drawing style defaults persist; annotations leave
 * through the export.
 */
export class CaptureAnnotateTool implements Tool<'capture-annotate'> {
  readonly id = TOOL_ID.captureAnnotate;
  readonly name = 'Capture & Annotate';
  readonly description = 'Capture the view, the full page, an area or an element and annotate it.';
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
              key: 'page',
              className: 'pixly-btn',
              disabled: busy,
              title: 'Scroll through the page and capture its full height',
              onClick: () => void this.captureAndEdit('page'),
            },
            'Page',
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
   * the region), and the annotation editor opens on the decoded bitmap. Page mode has its own
   * multi-slice pipeline (scroll & stitch) but lands in the same editor.
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

    if (mode === 'page') {
      await this.captureFullPageAndEdit(layer);

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

    this.openEditor(layer, bitmap, dpr);
    this.setFeedback('Capture ready — annotate away.', false);
  }

  /**
   * Page-mode capture round trip (spec: full_page_capture): Pixly's UI is hidden for the whole
   * scroll run, the page is walked and stitched by captureFullPage, and the editor opens on the
   * tall bitmap. Deactivating the tool mid-run aborts the walk; the page is restored either way.
   */
  private async captureFullPageAndEdit(layer: HTMLElement): Promise<void> {
    if (!this.context) {
      return;
    }

    this.capturing = true;
    this.setFeedback('Capturing the full page — scrolling through it…', false);

    const host = this.context.shadowRoot.host as HTMLElement;
    host.style.visibility = 'hidden';

    let result: FullPageCaptureResult | null;

    try {
      await waitForPaintedFrame();
      result = await captureFullPage(() => this.context === null);
    } finally {
      host.style.visibility = '';
    }

    this.capturing = false;

    // Aborted by deactivation mid-scroll (or deactivated right after): nothing to show.
    if (result === null || !this.context) {
      if (result?.ok) {
        result.bitmap.close();
      }

      return;
    }

    if (!result.ok) {
      this.setFeedback(
        `Capture failed (${result.error}). Open the Pixly popup and re-enable this tool to grant site access, then retry.`,
        true,
      );

      return;
    }

    this.openEditor(layer, result.bitmap, Math.max(1, window.devicePixelRatio || 1));
    this.setFeedback(
      result.truncated
        ? 'Capture ready — the page exceeds the maximum capture height, so the bottom was trimmed.'
        : 'Capture ready — annotate away.',
      false,
    );
  }

  /** Opens the annotation editor on a captured bitmap; every capture mode funnels through here. */
  private openEditor(layer: HTMLElement, bitmap: ImageBitmap, dpr: number): void {
    if (!this.context) {
      bitmap.close();

      return;
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
