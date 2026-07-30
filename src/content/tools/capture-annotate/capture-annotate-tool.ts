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

/**
 * Capture & Annotate (spec: capture_annotate_tool). Scope `origin`. Captures the visible
 * viewport (via the service worker, like Snapshot & Compare) and opens a full-screen editor to
 * draw arrows, lines, rectangles and ellipses over it. The exported PNG embeds the page title,
 * URL and capture time in a provenance banner, so a shared capture always says where it came
 * from. Only the drawing style defaults persist; annotations leave through the export.
 */
export class CaptureAnnotateTool implements Tool<'capture-annotate'> {
  readonly id = TOOL_ID.captureAnnotate;
  readonly name = 'Capture & Annotate';
  readonly description = 'Capture the page and annotate it with arrows and shapes for sharing.';
  readonly icon =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 15l6-6"/><path d="M10 9h4v4"/></svg>';
  readonly scope = 'origin' as const;

  private state: CaptureAnnotateState = this.defaultState();
  private context: ToolContext | null = null;
  private editor: AnnotationEditor | null = null;
  private feedback: { message: string; isError: boolean } | null = null;
  private capturing = false;

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
    return h(Fragment, null, [
      h('div', { key: 'capture', className: 'pixly-control__row' }, [
        h(
          'button',
          {
            key: 'b',
            className: 'pixly-btn pixly-btn--primary',
            disabled: this.capturing || this.editor !== null,
            onClick: () => void this.captureAndEdit(),
          },
          this.capturing ? 'Capturing…' : this.editor ? 'Editing capture…' : 'Capture & annotate',
        ),
      ]),
      this.renderFeedback(),
      h(
        'p',
        { key: 'hint', className: 'pixly-feedback' },
        'Draw arrows, lines, boxes and ellipses on the capture, then download or copy it. ' +
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
   * Full capture round trip: hide Pixly's own UI, wait for a painted frame, ask the service
   * worker for the visible-tab PNG, then open the annotation editor on the decoded bitmap.
   */
  private async captureAndEdit(): Promise<void> {
    if (this.capturing || this.editor || !this.context) {
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
    const bitmap = await createImageBitmap(blob);
    const layer = this.context.shadowRoot.querySelector<HTMLElement>('.pixly-layer');

    if (!layer) {
      bitmap.close();
      this.setFeedback('Pixly UI layer missing; cannot open the editor.', true);

      return;
    }

    this.editor = new AnnotationEditor(
      layer,
      {
        bitmap,
        dpr: Math.max(1, window.devicePixelRatio || 1),
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
