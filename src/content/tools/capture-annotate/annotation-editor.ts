import type { Annotation, AnnotationPoint } from './annotation-tools/annotation-tool';
import { ANNOTATION_TOOLS, getAnnotationTool } from './annotation-tools';
import { dragDistance, MIN_DRAG_DISTANCE_PX } from './annotation-geometry';
import {
  ANNOTATION_COLORS,
  buildCaptureFileName,
  formatCapturedAt,
  STROKE_WIDTH_PRESETS_PX,
} from './capture-annotate-state';
import { composeAnnotatedCapture } from './capture-export';

/** Everything the editor needs about the capture it is annotating. */
export interface CaptureSession {
  /** The screenshot at device-pixel scale, exactly as captureVisibleTab produced it. */
  bitmap: ImageBitmap;
  /** devicePixelRatio at capture time; maps bitmap pixels to CSS-pixel drawing coordinates. */
  dpr: number;
  title: string;
  url: string;
  capturedAtIso: string;
}

/** The user's current drawing selection, echoed to the tool for persistence. */
export interface EditorStyleSelection {
  toolId: string;
  color: string;
  strokeWidthPx: number;
}

export interface AnnotationEditorCallbacks {
  /** Fired whenever the user picks a different tool, color or width (persisted as defaults). */
  onStyleChange(selection: EditorStyleSelection): void;
  /** Fired when the user closes the editor (button or Esc); the owner destroys the editor. */
  onClose(): void;
}

/**
 * Full-screen annotation editor inside the Shadow DOM (RF-CORE-2), all imperative DOM + canvas —
 * drawing needs precise Pointer Events, never Preact. The toolbar and the render loop are built
 * entirely from the annotation tool registry: the editor knows the drag lifecycle, the tools
 * know how to paint, so new annotation tools require zero editor changes.
 */
export class AnnotationEditor {
  private readonly root: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly feedbackEl: HTMLSpanElement;
  private readonly toolButtons = new Map<string, HTMLButtonElement>();
  private readonly colorButtons = new Map<string, HTMLButtonElement>();
  private readonly widthButtons = new Map<number, HTMLButtonElement>();

  private readonly annotations: Annotation[] = [];
  private selection: EditorStyleSelection;
  /** In-flight drag: start point plus the latest preview end point. */
  private draft: { start: AnnotationPoint; end: AnnotationPoint } | null = null;
  private exporting = false;

  /** CSS-pixel size of the screenshot, the coordinate space annotations live in. */
  private readonly cssWidth: number;
  private readonly cssHeight: number;

  private readonly onKeyDown = (event: KeyboardEvent): void => this.handleKeyDown(event);

  constructor(
    parent: HTMLElement,
    private readonly session: CaptureSession,
    initialSelection: EditorStyleSelection,
    private readonly callbacks: AnnotationEditorCallbacks,
  ) {
    this.selection = initialSelection;
    this.cssWidth = Math.max(1, Math.round(session.bitmap.width / session.dpr));
    this.cssHeight = Math.max(1, Math.round(session.bitmap.height / session.dpr));

    this.root = document.createElement('div');
    this.root.className = 'pixly-capture-editor';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'pixly-capture-editor__canvas';
    this.canvas.width = session.bitmap.width;
    this.canvas.height = session.bitmap.height;
    this.canvas.style.width = `${this.cssWidth}px`;
    this.ctx = this.canvas.getContext('2d');

    this.feedbackEl = document.createElement('span');
    this.feedbackEl.className = 'pixly-feedback';
    this.feedbackEl.textContent = 'Drag on the capture to draw.';

    this.root.appendChild(this.buildTopbar());
    this.root.appendChild(this.buildStage());
    this.root.appendChild(this.buildStatusbar());
    parent.appendChild(this.root);

    this.installPointerHandlers();
    window.addEventListener('keydown', this.onKeyDown, true);

    this.syncSelectionButtons();
    this.repaint();
  }

  /** Applies an externally-changed selection (e.g. persisted state edited in another tab). */
  setSelection(selection: EditorStyleSelection): void {
    this.selection = selection;
    this.syncSelectionButtons();
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onKeyDown, true);
    this.root.remove();
    this.session.bitmap.close();
  }

  // ---- DOM construction -------------------------------------------------

  private buildTopbar(): HTMLElement {
    const topbar = document.createElement('div');
    topbar.className = 'pixly-capture-editor__topbar';

    // Tool buttons come straight from the registry; a new tool shows up here automatically.
    const toolGroup = this.group();

    for (const tool of ANNOTATION_TOOLS) {
      const button = this.iconButton('pixly-tab', tool.icon, tool.name, () =>
        this.updateSelection({ toolId: tool.id }),
      );

      this.toolButtons.set(tool.id, button);
      toolGroup.appendChild(button);
    }

    const colorGroup = this.group();

    for (const color of ANNOTATION_COLORS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pixly-capture-swatch';
      button.style.background = color;
      button.title = color;
      button.addEventListener('click', () => this.updateSelection({ color }));
      this.colorButtons.set(color, button);
      colorGroup.appendChild(button);
    }

    const widthGroup = this.group();

    for (const widthPx of STROKE_WIDTH_PRESETS_PX) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pixly-tab';
      button.title = `${widthPx}px stroke`;

      const dot = document.createElement('span');
      dot.className = 'pixly-capture-widthdot';
      const dotSize = Math.min(16, widthPx * 2 + 2);
      dot.style.width = `${dotSize}px`;
      dot.style.height = `${dotSize}px`;
      button.appendChild(dot);

      button.addEventListener('click', () => this.updateSelection({ strokeWidthPx: widthPx }));
      this.widthButtons.set(widthPx, button);
      widthGroup.appendChild(button);
    }

    const historyGroup = this.group();
    historyGroup.appendChild(
      this.iconButton(
        'pixly-iconbtn',
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 14L4 9l5-5"/><path d="M4 9h11a5 5 0 010 10h-4"/></svg>',
        'Undo (Ctrl+Z)',
        () => this.undo(),
      ),
    );
    historyGroup.appendChild(
      this.iconButton(
        'pixly-iconbtn',
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6l1 14h10l1-14"/></svg>',
        'Clear all annotations',
        () => this.clearAll(),
      ),
    );

    const spacer = document.createElement('div');
    spacer.className = 'pixly-capture-editor__spacer';

    const copyButton = document.createElement('button');
    copyButton.type = 'button';
    copyButton.className = 'pixly-btn';
    copyButton.textContent = 'Copy';
    copyButton.title = 'Copy the annotated PNG to the clipboard';
    copyButton.addEventListener('click', () => void this.copyToClipboard());

    const downloadButton = document.createElement('button');
    downloadButton.type = 'button';
    downloadButton.className = 'pixly-btn pixly-btn--primary';
    downloadButton.textContent = 'Download PNG';
    downloadButton.addEventListener('click', () => void this.download());

    const closeButton = this.iconButton(
      'pixly-iconbtn',
      '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6L6 18"/></svg>',
      'Close (Esc)',
      () => this.callbacks.onClose(),
    );

    for (const node of [
      toolGroup,
      this.divider(),
      colorGroup,
      this.divider(),
      widthGroup,
      this.divider(),
      historyGroup,
      spacer,
      copyButton,
      downloadButton,
      closeButton,
    ]) {
      topbar.appendChild(node);
    }

    return topbar;
  }

  private buildStage(): HTMLElement {
    const stage = document.createElement('div');
    stage.className = 'pixly-capture-editor__stage';
    stage.appendChild(this.canvas);

    return stage;
  }

  private buildStatusbar(): HTMLElement {
    const statusbar = document.createElement('div');
    statusbar.className = 'pixly-capture-editor__statusbar';

    const meta = document.createElement('span');
    meta.className = 'pixly-capture-editor__meta';
    const capturedAt = formatCapturedAt(this.session.capturedAtIso);
    const metaText = `${this.session.title || this.session.url} · ${this.session.url}${
      capturedAt ? ` · ${capturedAt}` : ''
    }`;
    meta.textContent = `Embedded on export: ${metaText}`;
    meta.title = metaText;

    statusbar.appendChild(this.feedbackEl);
    statusbar.appendChild(meta);

    return statusbar;
  }

  private group(): HTMLElement {
    const group = document.createElement('div');
    group.className = 'pixly-capture-editor__group';

    return group;
  }

  private divider(): HTMLElement {
    const divider = document.createElement('div');
    divider.className = 'pixly-capture-editor__divider';

    return divider;
  }

  private iconButton(
    className: string,
    iconSvg: string,
    title: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.innerHTML = iconSvg;
    button.title = title;
    button.addEventListener('click', onClick);

    return button;
  }

  // ---- Selection --------------------------------------------------------

  private updateSelection(partial: Partial<EditorStyleSelection>): void {
    this.selection = { ...this.selection, ...partial };
    this.syncSelectionButtons();
    this.callbacks.onStyleChange({ ...this.selection });
  }

  private syncSelectionButtons(): void {
    for (const [toolId, button] of this.toolButtons) {
      button.classList.toggle('pixly-tab--active', toolId === this.selection.toolId);
    }

    for (const [color, button] of this.colorButtons) {
      button.classList.toggle(
        'pixly-capture-swatch--active',
        color.toLowerCase() === this.selection.color.toLowerCase(),
      );
    }

    for (const [widthPx, button] of this.widthButtons) {
      button.classList.toggle('pixly-tab--active', widthPx === this.selection.strokeWidthPx);
    }
  }

  // ---- Drawing ----------------------------------------------------------

  private installPointerHandlers(): void {
    this.canvas.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0) {
        return;
      }

      event.preventDefault();
      this.canvas.setPointerCapture(event.pointerId);
      const point = this.toCanvasPoint(event);
      this.draft = { start: point, end: point };
    });

    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.draft) {
        return;
      }

      this.draft.end = this.toCanvasPoint(event);
      this.repaint();
    });

    const finish = (event: PointerEvent, commit: boolean): void => {
      if (!this.draft) {
        return;
      }

      const draft = this.draft;
      this.draft = null;

      if (commit) {
        draft.end = this.toCanvasPoint(event);

        // Sub-pixel drags are clicks, not shapes; committing them would litter invisible marks.
        if (dragDistance(draft.start, draft.end) >= MIN_DRAG_DISTANCE_PX) {
          this.annotations.push(this.buildAnnotation(draft.start, draft.end));
        }
      }

      this.repaint();
    };

    this.canvas.addEventListener('pointerup', (event) => finish(event, true));
    this.canvas.addEventListener('pointercancel', (event) => finish(event, false));
  }

  private buildAnnotation(start: AnnotationPoint, end: AnnotationPoint): Annotation {
    return {
      toolId: this.selection.toolId,
      start,
      end,
      style: { color: this.selection.color, strokeWidthPx: this.selection.strokeWidthPx },
    };
  }

  /**
   * Maps a pointer event to screenshot CSS-pixel coordinates. The canvas may be scaled down by
   * the stage's max-width fit, so the mapping goes through its live bounding rect.
   */
  private toCanvasPoint(event: PointerEvent): AnnotationPoint {
    const rect = this.canvas.getBoundingClientRect();
    const scaleX = rect.width > 0 ? this.cssWidth / rect.width : 1;
    const scaleY = rect.height > 0 ? this.cssHeight / rect.height : 1;

    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  }

  /** Full repaint: screenshot, committed annotations, then the in-flight preview if any. */
  private repaint(): void {
    if (!this.ctx) {
      return;
    }

    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.session.bitmap, 0, 0);

    // Annotations live in CSS pixels; the dpr transform paints them 1:1 over the screenshot.
    ctx.setTransform(this.session.dpr, 0, 0, this.session.dpr, 0, 0);

    for (const annotation of this.annotations) {
      getAnnotationTool(annotation.toolId)?.render(ctx, annotation);
    }

    if (this.draft && dragDistance(this.draft.start, this.draft.end) >= MIN_DRAG_DISTANCE_PX) {
      getAnnotationTool(this.selection.toolId)?.render(
        ctx,
        this.buildAnnotation(this.draft.start, this.draft.end),
      );
    }
  }

  private undo(): void {
    if (this.annotations.length === 0) {
      return;
    }

    this.annotations.pop();
    this.repaint();
  }

  private clearAll(): void {
    if (this.annotations.length === 0) {
      return;
    }

    this.annotations.length = 0;
    this.repaint();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.callbacks.onClose();

      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.stopPropagation();
      this.undo();
    }
  }

  // ---- Export -----------------------------------------------------------

  private async download(): Promise<void> {
    const blob = await this.exportBlob();

    if (!blob) {
      return;
    }

    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = buildCaptureFileName(this.session.url, new Date());
    anchor.click();
    URL.revokeObjectURL(url);
    this.setFeedback('PNG downloaded — title and URL embedded.', false);
  }

  private async copyToClipboard(): Promise<void> {
    const blob = await this.exportBlob();

    if (!blob) {
      return;
    }

    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      this.setFeedback('Copied to the clipboard.', false);
    } catch {
      this.setFeedback('Clipboard copy failed — use Download PNG instead.', true);
    }
  }

  private async exportBlob(): Promise<Blob | null> {
    if (this.exporting) {
      return null;
    }

    this.exporting = true;

    try {
      return await composeAnnotatedCapture({
        image: this.session.bitmap,
        dpr: this.session.dpr,
        annotations: this.annotations,
        provenance: {
          title: this.session.title,
          url: this.session.url,
          capturedAt: formatCapturedAt(this.session.capturedAtIso),
        },
      });
    } catch (error) {
      this.setFeedback(error instanceof Error ? error.message : 'Export failed.', true);

      return null;
    } finally {
      this.exporting = false;
    }
  }

  private setFeedback(message: string, isError: boolean): void {
    this.feedbackEl.textContent = message;
    this.feedbackEl.classList.toggle('pixly-feedback--error', isError);
  }
}
