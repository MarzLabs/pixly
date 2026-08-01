import { DESIGN_TOKENS } from '@shared/constants/design-tokens';
import type {
  Annotation,
  AnnotationInteraction,
  AnnotationPoint,
} from './annotation-tools/annotation-tool';
import { ANNOTATION_TOOLS, getAnnotationTool } from './annotation-tools';
import { translateAnnotation } from './annotation-tools/annotation-tool';
import type { AnnotationGrip } from './annotation-geometry';
import {
  dragDistance,
  GRIP_RADIUS_PX,
  GRIP_VISUAL_RADIUS_PX,
  gripAtPoint,
  HIT_SLACK_PX,
  MIN_DRAG_DISTANCE_PX,
  normalizedRect,
  pointInRect,
  resizeCursorForGrip,
} from './annotation-geometry';
import { AnnotationHistory } from './annotation-history';
import {
  ANNOTATION_COLORS,
  buildCaptureFileName,
  formatCapturedAt,
  STROKE_WIDTH_PRESETS_PX,
} from './capture-annotate-state';
import { composeAnnotatedCapture } from './capture-export';
import { regionToDeviceCrop } from './capture-region';
import { textFontSizePx, textLineHeightPx } from './text-metrics';

/** Whether any part of the annotation's bounding box still falls inside the cropped frame. */
function annotationVisibleWithin(annotation: Annotation, width: number, height: number): boolean {
  const rect = normalizedRect(annotation.start, annotation.end);

  return (
    rect.left < width &&
    rect.left + rect.width > 0 &&
    rect.top < height &&
    rect.top + rect.height > 0
  );
}

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
  private readonly canvasWrap: HTMLDivElement;
  private readonly glyphBar: HTMLDivElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly feedbackEl: HTMLSpanElement;
  private readonly toolButtons = new Map<string, HTMLButtonElement>();
  private readonly colorButtons = new Map<string, HTMLButtonElement>();
  private readonly widthButtons = new Map<number, HTMLButtonElement>();
  /** Selected glyph per stamp tool (session-only); defaults to the tool's first glyph. */
  private readonly selectedGlyphs = new Map<string, string>();

  /** Annotations plus their undo history: inserts, moves, resizes and clears all revert. */
  private readonly history = new AnnotationHistory();
  private selection: EditorStyleSelection;
  /** In-flight drag: start point plus the latest preview end point. */
  private draft: { start: AnnotationPoint; end: AnnotationPoint } | null = null;
  /** Open inline text entry ('text' interaction); committed on Enter/blur, cancelled on Esc. */
  private textDraft: { point: AnnotationPoint; input: HTMLTextAreaElement } | null = null;
  /** Move mode: clicks grab existing annotations instead of drawing new ones. */
  private moveMode = false;
  private moveButton: HTMLButtonElement | null = null;
  /** Crop mode: dragging defines a rect that Apply crop shrinks the whole capture to. */
  private cropMode = false;
  private cropButton: HTMLButtonElement | null = null;
  /** In-flight crop drag: start point plus the latest preview end point. */
  private cropDraft: { start: AnnotationPoint; end: AnnotationPoint } | null = null;
  private readonly cropControls: HTMLDivElement;
  /**
   * Drag in progress in move mode: the annotation's index, the pointer's last position, and
   * what was grabbed — 'whole' translates the shape, an endpoint grip resizes/reshapes it.
   */
  private moving: { index: number; last: AnnotationPoint; grip: AnnotationGrip | 'whole' } | null =
    null;
  /** Annotation under the pointer while idle; its grips/outline are painted as affordances. */
  private hoveredIndex: number | null = null;
  /**
   * Persistently selected annotation (set by grabbing or by creating one): color swatches and
   * width presets restyle it, Delete removes it, Esc deselects it.
   */
  private selectedIndex: number | null = null;
  private exporting = false;

  /** CSS-pixel size of the screenshot, the coordinate space annotations live in. Shrinks on crop. */
  private cssWidth: number;
  private cssHeight: number;

  private readonly onKeyDown = (event: KeyboardEvent): void => this.handleKeyDown(event);

  /**
   * Outer half of the modal keyboard barrier, for keypress/keyup (keydown runs through
   * handleKeyDown). Shadow DOM retargeting makes the page see editor keystrokes with the plain
   * host div as target, so page hotkey handlers ("is the user typing in a field?") misfire —
   * e.g. GitHub's single-letter shortcuts while typing a label. While the editor is open, no
   * key event that is not headed into the editor's own DOM may propagate to the page.
   */
  private readonly onKeyGuard = (event: KeyboardEvent): void => {
    if (!this.isInsideEditor(event)) {
      event.stopPropagation();
    }
  };

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

    // Positioned wrapper so the inline text input can sit at the click point over the canvas.
    this.canvasWrap = document.createElement('div');
    this.canvasWrap.className = 'pixly-capture-editor__canvas-wrap';
    this.canvasWrap.appendChild(this.canvas);

    this.cropControls = document.createElement('div');
    this.cropControls.className =
      'pixly-capture-editor__crop-controls pixly-capture-editor__crop-controls--hidden';

    const applyCropButton = document.createElement('button');
    applyCropButton.type = 'button';
    applyCropButton.className = 'pixly-btn pixly-btn--primary';
    applyCropButton.textContent = 'Apply crop';
    applyCropButton.addEventListener('click', () => void this.applyCrop());

    const cancelCropButton = document.createElement('button');
    cancelCropButton.type = 'button';
    cancelCropButton.className = 'pixly-btn';
    cancelCropButton.textContent = 'Cancel';
    cancelCropButton.addEventListener('click', () => this.cancelCropDraft());

    this.cropControls.append(applyCropButton, cancelCropButton);
    this.canvasWrap.appendChild(this.cropControls);

    this.glyphBar = document.createElement('div');
    this.glyphBar.className = 'pixly-capture-editor__glyphbar';

    this.feedbackEl = document.createElement('span');
    this.feedbackEl.className = 'pixly-feedback';
    this.feedbackEl.textContent =
      'Drag to draw. Grab any annotation to move, resize or restyle it; Alt-drag draws over it.';

    this.root.appendChild(this.buildTopbar());
    this.root.appendChild(this.glyphBar);
    this.root.appendChild(this.buildStage());
    this.root.appendChild(this.buildStatusbar());
    parent.appendChild(this.root);

    this.installPointerHandlers();
    window.addEventListener('keydown', this.onKeyDown, true);

    // Modal keyboard barrier, in two halves. Outer half (window, capture phase): keys NOT
    // aimed at the editor's own DOM stop here, so the page never sees them; keys aimed at the
    // editor keep descending — the text entry needs them. Inner half (editor root, bubble
    // phase): those editor-bound keys stop at the boundary on the way back out, so retargeted
    // events never reach page hotkey handlers (see onKeyGuard). Root listeners die with the
    // root, so only the window halves need teardown in destroy().
    window.addEventListener('keypress', this.onKeyGuard, true);
    window.addEventListener('keyup', this.onKeyGuard, true);

    for (const type of ['keydown', 'keypress', 'keyup'] as const) {
      this.root.addEventListener(type, (event) => event.stopPropagation());
    }

    this.syncSelectionButtons();
    this.repaint();
  }

  /** Applies an externally-changed selection (e.g. persisted state edited in another tab). */
  setSelection(selection: EditorStyleSelection): void {
    this.selection = selection;
    this.syncSelectionButtons();
  }

  destroy(): void {
    // Discarded, not committed: destroy() must never paint on the about-to-close bitmap.
    this.cancelTextDraft();
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keypress', this.onKeyGuard, true);
    window.removeEventListener('keyup', this.onKeyGuard, true);
    this.root.remove();
    this.session.bitmap.close();
  }

  // ---- DOM construction -------------------------------------------------

  private buildTopbar(): HTMLElement {
    const topbar = document.createElement('div');
    topbar.className = 'pixly-capture-editor__topbar';

    // Tool buttons come straight from the registry; a new tool shows up here automatically.
    // Move is editor-owned (a gesture mode, not a paint tool), so it sits ahead of the registry.
    const toolGroup = this.group();

    this.moveButton = this.iconButton(
      'pixly-tab',
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3l7 16 2-7 7-2z"/></svg>',
      'Move annotations',
      () => this.setMoveMode(true),
    );
    toolGroup.appendChild(this.moveButton);

    this.cropButton = this.iconButton(
      'pixly-tab',
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 002 2h14"/><path d="M2 6h14a2 2 0 012 2v14"/></svg>',
      'Crop the capture',
      () => this.setCropMode(true),
    );
    toolGroup.appendChild(this.cropButton);

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
    stage.appendChild(this.canvasWrap);

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
    // Picking a paint tool is an implicit exit from move/crop mode (their affordances disappear
    // with it).
    if (partial.toolId !== undefined && (this.moveMode || this.cropMode)) {
      this.moveMode = false;
      this.cropMode = false;
      this.cropDraft = null;
      this.updateCropControls();
      this.hoveredIndex = null;
      this.repaint();
    }

    this.selection = { ...this.selection, ...partial };

    // A style facet (not the tool) restyles the selected annotation too, as one undoable
    // step — width also re-scales selected text/emoji, their select-then-resize path.
    if (
      this.selectedIndex !== null &&
      (partial.color !== undefined || partial.strokeWidthPx !== undefined)
    ) {
      const target = this.history.at(this.selectedIndex);

      if (target) {
        this.history.update(this.selectedIndex, {
          ...target,
          style: { color: this.selection.color, strokeWidthPx: this.selection.strokeWidthPx },
        });
        this.repaint();
      }
    }

    this.syncSelectionButtons();
    this.callbacks.onStyleChange({ ...this.selection });
  }

  /** Changes the persistent selection, repainting only when it actually changed. */
  private selectIndex(index: number | null): void {
    if (this.selectedIndex !== index) {
      this.selectedIndex = index;
      this.repaint();
    }
  }

  private setMoveMode(enabled: boolean): void {
    this.moveMode = enabled;
    this.commitTextDraft();
    this.hoveredIndex = null;

    if (enabled && this.cropMode) {
      this.cropMode = false;
      this.cropDraft = null;
      this.updateCropControls();
    }

    this.syncSelectionButtons();
    this.repaint();

    if (enabled) {
      this.setFeedback('Move: drag an annotation to reposition it, or a grip to resize it.', false);
    }
  }

  private setCropMode(enabled: boolean): void {
    this.cropMode = enabled;
    this.commitTextDraft();
    this.cropDraft = null;
    this.hoveredIndex = null;
    this.selectedIndex = null;

    if (enabled) {
      this.moveMode = false;
    }

    this.updateCropControls();
    this.syncSelectionButtons();
    this.repaint();

    if (enabled) {
      this.setFeedback(
        'Crop: drag the area to keep, then Apply crop (Enter) or Cancel (Esc).',
        false,
      );
    }
  }

  private syncSelectionButtons(): void {
    this.moveButton?.classList.toggle('pixly-tab--active', this.moveMode);
    this.cropButton?.classList.toggle('pixly-tab--active', this.cropMode);

    for (const [toolId, button] of this.toolButtons) {
      button.classList.toggle(
        'pixly-tab--active',
        !this.moveMode && !this.cropMode && toolId === this.selection.toolId,
      );
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

    this.canvas.style.cursor = this.baseCursor();
    this.refreshGlyphBar();
  }

  /** Cursor over empty canvas for the current mode/tool; hover over annotations overrides it. */
  private baseCursor(): string {
    if (this.moveMode) {
      return 'default';
    }

    if (this.cropMode) {
      return 'crosshair';
    }

    const interaction = this.activeInteraction();

    return interaction === 'text' ? 'text' : interaction === 'stamp' ? 'copy' : 'crosshair';
  }

  /** Gesture the active tool needs; tools without a declared interaction are drag-shaped. */
  private activeInteraction(): AnnotationInteraction {
    return getAnnotationTool(this.selection.toolId)?.interaction ?? 'drag';
  }

  /** Currently selected glyph for the active stamp tool, defaulting to its first choice. */
  private activeGlyph(): string | null {
    const tool = getAnnotationTool(this.selection.toolId);
    const glyphs = tool?.glyphs ?? [];

    if (!tool || glyphs.length === 0) {
      return null;
    }

    return this.selectedGlyphs.get(tool.id) ?? glyphs[0] ?? null;
  }

  /** Secondary palette row for stamp tools (e.g. the emoji set); hidden for the rest. */
  private refreshGlyphBar(): void {
    const tool = getAnnotationTool(this.selection.toolId);
    const glyphs = this.moveMode ? [] : (tool?.glyphs ?? []);

    this.glyphBar.classList.toggle('pixly-capture-editor__glyphbar--hidden', glyphs.length === 0);
    this.glyphBar.replaceChildren();

    if (!tool || glyphs.length === 0) {
      return;
    }

    const active = this.activeGlyph();

    for (const glyph of glyphs) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'pixly-tab pixly-capture-glyph';
      button.textContent = glyph;
      button.title = `Stamp ${glyph}`;
      button.classList.toggle('pixly-tab--active', glyph === active);
      button.addEventListener('click', () => {
        this.selectedGlyphs.set(tool.id, glyph);
        this.refreshGlyphBar();
      });
      this.glyphBar.appendChild(button);
    }
  }

  // ---- Drawing ----------------------------------------------------------

  private installPointerHandlers(): void {
    this.canvas.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0) {
        return;
      }

      event.preventDefault();

      // A click outside an open text entry commits it; that click places nothing else.
      if (this.textDraft) {
        this.commitTextDraft();

        return;
      }

      const point = this.toCanvasPoint(event);

      if (this.cropMode) {
        this.canvas.setPointerCapture(event.pointerId);
        this.cropDraft = { start: point, end: point };
        this.updateCropControls();
        this.repaint();

        return;
      }

      // Direct manipulation with ANY tool: a press on an existing annotation grabs and
      // selects it instead of drawing. Alt forces the tool action (draw over an existing
      // annotation); move mode ignores Alt — grabbing is all it does.
      const grab = event.altKey && !this.moveMode ? null : this.grabAt(point);

      if (grab) {
        this.canvas.setPointerCapture(event.pointerId);
        // One history step per drag gesture, not per pointermove frame (see endGesture).
        this.history.beginGesture();
        this.moving = { index: grab.index, last: point, grip: grab.grip };
        this.selectedIndex = grab.index;
        this.hoveredIndex = grab.index;
        this.repaint();

        return;
      }

      // Empty space: any active selection dissolves before the tool acts.
      this.selectIndex(null);

      if (this.moveMode) {
        return;
      }

      const interaction = this.activeInteraction();

      if (interaction === 'text') {
        this.openTextDraft(point);

        return;
      }

      if (interaction === 'stamp') {
        const glyph = this.activeGlyph();

        if (glyph) {
          this.history.push(this.buildAnnotation(point, point, glyph));
          // Fresh annotations start selected, so a wrong color is one swatch click away.
          this.selectedIndex = this.history.count - 1;
          this.repaint();
        }

        return;
      }

      this.canvas.setPointerCapture(event.pointerId);
      this.draft = { start: point, end: point };
    });

    this.canvas.addEventListener('pointermove', (event) => {
      if (this.cropMode) {
        if (this.cropDraft) {
          this.cropDraft.end = this.toCanvasPoint(event);
          this.updateCropControls();
          this.repaint();
        }

        return;
      }

      if (this.moving) {
        const point = this.toCanvasPoint(event);
        const target = this.history.at(this.moving.index);

        if (target) {
          // A grip drag re-anchors that endpoint at the pointer; a body drag translates both.
          this.history.updateDuringGesture(
            this.moving.index,
            this.moving.grip === 'whole'
              ? translateAnnotation(
                  target,
                  point.x - this.moving.last.x,
                  point.y - this.moving.last.y,
                )
              : this.moving.grip === 'start'
                ? { ...target, start: point }
                : { ...target, end: point },
          );
          this.moving.last = point;
          this.repaint();
        }

        return;
      }

      // Idle hover in ANY mode: grabbable annotations advertise themselves (grips/outline +
      // grab cursor); over empty space the active tool's own cursor returns. Alt previews
      // the forced-draw escape hatch by suppressing the grab affordance.
      if (!this.draft) {
        const point = this.toCanvasPoint(event);
        const grab = event.altKey && !this.moveMode ? null : this.grabAt(point);
        const hoveredIndex = grab?.index ?? null;

        if (hoveredIndex !== this.hoveredIndex) {
          this.hoveredIndex = hoveredIndex;
          this.repaint();
        }

        this.canvas.style.cursor = grab ? this.cursorForGrab(grab) : this.baseCursor();

        return;
      }

      this.draft.end = this.toCanvasPoint(event);
      this.repaint();
    });

    const finish = (event: PointerEvent, commit: boolean): void => {
      if (this.cropMode) {
        if (!commit) {
          this.cropDraft = null;
        } else if (this.cropDraft) {
          this.cropDraft.end = this.toCanvasPoint(event);
        }

        this.updateCropControls();
        this.repaint();

        return;
      }

      if (this.moving) {
        // Zero-delta grabs leave no history step; real drags close as exactly one.
        this.history.endGesture();
        this.moving = null;

        return;
      }

      if (!this.draft) {
        return;
      }

      const draft = this.draft;
      this.draft = null;

      if (commit) {
        draft.end = this.toCanvasPoint(event);

        // Sub-pixel drags are clicks, not shapes; committing them would litter invisible marks.
        if (dragDistance(draft.start, draft.end) >= MIN_DRAG_DISTANCE_PX) {
          this.history.push(this.buildAnnotation(draft.start, draft.end));
          // Fresh annotations start selected, so a wrong color is one swatch click away.
          this.selectedIndex = this.history.count - 1;
        }
      }

      this.repaint();
    };

    this.canvas.addEventListener('pointerup', (event) => finish(event, true));
    this.canvas.addEventListener('pointercancel', (event) => finish(event, false));
  }

  private buildAnnotation(start: AnnotationPoint, end: AnnotationPoint, text?: string): Annotation {
    const annotation: Annotation = {
      toolId: this.selection.toolId,
      start,
      end,
      style: { color: this.selection.color, strokeWidthPx: this.selection.strokeWidthPx },
    };

    if (text !== undefined) {
      annotation.text = text;
    }

    return annotation;
  }

  // ---- Inline text entry ------------------------------------------------

  /**
   * Opens the inline entry for a 'text' tool at the clicked point. The textarea mirrors the
   * committed render (font scaled by the canvas display scale, no soft wrap: only explicit
   * newlines break lines), so what the user types is what lands on the capture.
   */
  private openTextDraft(point: AnnotationPoint): void {
    const scale = this.displayScale();
    const fontSizePx = textFontSizePx(this.selection.strokeWidthPx);
    const lineHeightPx = textLineHeightPx(fontSizePx);

    const input = document.createElement('textarea');
    input.className = 'pixly-capture-editor__textinput';
    input.rows = 1;
    input.wrap = 'off';
    input.placeholder = 'Type — Enter commits, Shift+Enter breaks the line';
    input.style.left = `${point.x * scale}px`;
    input.style.top = `${point.y * scale}px`;
    input.style.fontFamily = DESIGN_TOKENS.fontFamily;
    input.style.fontSize = `${fontSizePx * scale}px`;
    input.style.lineHeight = `${lineHeightPx * scale}px`;
    input.style.color = this.selection.color;

    const autoSize = (): void => {
      // Collapse first so scrollWidth/scrollHeight report the content, not the previous box.
      input.style.width = '0';
      input.style.height = '0';
      input.style.width = `${Math.max(160, input.scrollWidth + 8)}px`;
      input.style.height = `${Math.max(lineHeightPx * scale, input.scrollHeight)}px`;
    };

    input.addEventListener('input', autoSize);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        this.commitTextDraft();
      }
    });
    input.addEventListener('blur', () => this.commitTextDraft());

    this.canvasWrap.appendChild(input);
    this.textDraft = { point, input };
    input.focus();
    autoSize();
  }

  private commitTextDraft(): void {
    const draft = this.textDraft;

    if (!draft) {
      return;
    }

    // Cleared BEFORE removal so the removal-triggered blur finds nothing to commit again.
    this.textDraft = null;
    const text = draft.input.value.replace(/\s+$/u, '');
    draft.input.remove();

    if (text.trim().length > 0) {
      this.history.push(this.buildAnnotation(draft.point, draft.point, text));
      // Fresh annotations start selected, so a wrong color is one swatch click away.
      this.selectedIndex = this.history.count - 1;
      this.repaint();
    }
  }

  private cancelTextDraft(): void {
    const draft = this.textDraft;

    if (!draft) {
      return;
    }

    this.textDraft = null;
    draft.input.remove();
  }

  /** On-screen CSS pixels per capture CSS pixel (the stage may scale the canvas down to fit). */
  private displayScale(): number {
    const rect = this.canvas.getBoundingClientRect();

    return rect.width > 0 && this.cssWidth > 0 ? rect.width / this.cssWidth : 1;
  }

  /**
   * Topmost grab under the point (later annotations paint on top, so the scan runs in reverse
   * insertion order). Drag-shaped annotations expose endpoint grips that win over their body,
   * so resizing works even where the grip overlaps the stroke. Each tool's own hitTest decides
   * its body grab area; tools without one get a padded bounding box of their geometry.
   */
  private grabAt(point: AnnotationPoint): { index: number; grip: AnnotationGrip | 'whole' } | null {
    if (!this.ctx) {
      return null;
    }

    for (let index = this.history.count - 1; index >= 0; index -= 1) {
      const annotation = this.history.at(index);

      if (!annotation) {
        continue;
      }

      const tool = getAnnotationTool(annotation.toolId);

      // Only drag-defined shapes resize; text and stamps scale via the stroke-width presets.
      if ((tool?.interaction ?? 'drag') === 'drag') {
        const grip = gripAtPoint(annotation.start, annotation.end, point, GRIP_RADIUS_PX);

        if (grip) {
          return { index, grip };
        }
      }

      const hit = tool?.hitTest
        ? tool.hitTest(this.ctx, annotation, point)
        : pointInRect(
            point,
            normalizedRect(annotation.start, annotation.end),
            HIT_SLACK_PX + annotation.style.strokeWidthPx,
          );

      if (hit) {
        return { index, grip: 'whole' };
      }
    }

    return null;
  }

  private cursorForGrab(grab: { index: number; grip: AnnotationGrip | 'whole' } | null): string {
    if (!grab) {
      return 'default';
    }

    if (grab.grip === 'whole') {
      return 'move';
    }

    const annotation = this.history.at(grab.index);

    if (!annotation) {
      return 'default';
    }

    return grab.grip === 'start'
      ? resizeCursorForGrip(annotation.start, annotation.end)
      : resizeCursorForGrip(annotation.end, annotation.start);
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

    for (const annotation of this.history.list()) {
      getAnnotationTool(annotation.toolId)?.render(ctx, annotation);
    }

    if (this.draft && dragDistance(this.draft.start, this.draft.end) >= MIN_DRAG_DISTANCE_PX) {
      getAnnotationTool(this.selection.toolId)?.render(
        ctx,
        this.buildAnnotation(this.draft.start, this.draft.end),
      );
    }

    this.paintSelectionAffordances(ctx);
    this.paintCropOverlay(ctx);
  }

  /** Dims everything outside the pending crop rect and outlines the area that will be kept. */
  private paintCropOverlay(ctx: CanvasRenderingContext2D): void {
    if (!this.cropMode || !this.cropDraft) {
      return;
    }

    const rect = normalizedRect(this.cropDraft.start, this.cropDraft.end);

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, this.cssWidth, rect.top);
    ctx.fillRect(
      0,
      rect.top + rect.height,
      this.cssWidth,
      this.cssHeight - (rect.top + rect.height),
    );
    ctx.fillRect(0, rect.top, rect.left, rect.height);
    ctx.fillRect(
      rect.left + rect.width,
      rect.top,
      this.cssWidth - (rect.left + rect.width),
      rect.height,
    );

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(rect.left, rect.top, rect.width, rect.height);
    ctx.restore();
  }

  /** Whether the in-flight crop drag is big enough to apply (vs. an accidental click). */
  private hasValidCropDraft(): boolean {
    return (
      this.cropDraft !== null &&
      dragDistance(this.cropDraft.start, this.cropDraft.end) >= MIN_DRAG_DISTANCE_PX
    );
  }

  /** Shows/hides and repositions the Apply/Cancel buttons under the pending crop rect. */
  private updateCropControls(): void {
    if (!this.hasValidCropDraft() || !this.cropDraft) {
      this.cropControls.classList.add('pixly-capture-editor__crop-controls--hidden');

      return;
    }

    const rect = normalizedRect(this.cropDraft.start, this.cropDraft.end);
    const scale = this.displayScale();

    this.cropControls.style.left = `${rect.left * scale}px`;
    this.cropControls.style.top = `${Math.min(this.cssHeight, rect.top + rect.height) * scale + 8}px`;
    this.cropControls.classList.remove('pixly-capture-editor__crop-controls--hidden');
  }

  /** Discards the pending crop rect without leaving crop mode. */
  private cancelCropDraft(): void {
    this.cropDraft = null;
    this.updateCropControls();
    this.repaint();
  }

  /**
   * Shrinks the capture to the pending crop rect: replaces the session bitmap with a cropped
   * one, resizes the canvas, and re-anchors surviving annotations to the new origin. Not part of
   * the undo stack — the annotation history is reset instead (see AnnotationHistory.resetAfterCrop).
   */
  private async applyCrop(): Promise<void> {
    if (!this.hasValidCropDraft() || !this.cropDraft) {
      return;
    }

    const rect = normalizedRect(this.cropDraft.start, this.cropDraft.end);
    const crop = regionToDeviceCrop(
      rect,
      this.session.dpr,
      this.session.bitmap.width,
      this.session.bitmap.height,
    );

    this.cropDraft = null;
    this.cropMode = false;
    this.updateCropControls();

    if (!crop) {
      this.syncSelectionButtons();
      this.repaint();

      return;
    }

    let cropped: ImageBitmap;

    try {
      cropped = await createImageBitmap(this.session.bitmap, crop.sx, crop.sy, crop.sw, crop.sh);
    } catch (error) {
      this.setFeedback(error instanceof Error ? error.message : 'Crop failed.', true);
      this.syncSelectionButtons();
      this.repaint();

      return;
    }

    const oldBitmap = this.session.bitmap;
    this.session.bitmap = cropped;
    oldBitmap.close();

    const offsetLeft = crop.sx / this.session.dpr;
    const offsetTop = crop.sy / this.session.dpr;

    this.cssWidth = Math.max(1, Math.round(cropped.width / this.session.dpr));
    this.cssHeight = Math.max(1, Math.round(cropped.height / this.session.dpr));
    this.canvas.width = cropped.width;
    this.canvas.height = cropped.height;
    this.canvas.style.width = `${this.cssWidth}px`;

    const shifted = this.history
      .list()
      .map((annotation) => translateAnnotation(annotation, -offsetLeft, -offsetTop))
      .filter((annotation) => annotationVisibleWithin(annotation, this.cssWidth, this.cssHeight));

    this.history.resetAfterCrop(shifted);
    this.selectedIndex = null;
    this.hoveredIndex = null;

    this.syncSelectionButtons();
    this.repaint();
    this.setFeedback('Cropped to the selected area.', false);
  }

  /**
   * Grab/selection affordances for the hovered and selected annotations: endpoint grips on
   * drag-shaped ones, a dashed outline (via the tool's optional bounds) on text and stamps.
   * Editor-only visuals — the export re-renders from the clean annotation list.
   */
  private paintSelectionAffordances(ctx: CanvasRenderingContext2D): void {
    const indices = new Set([this.hoveredIndex, this.selectedIndex]);

    for (const index of indices) {
      if (index === null) {
        continue;
      }

      const annotation = this.history.at(index);

      if (!annotation) {
        continue;
      }

      const tool = getAnnotationTool(annotation.toolId);

      if ((tool?.interaction ?? 'drag') === 'drag') {
        for (const point of [annotation.start, annotation.end]) {
          ctx.beginPath();
          ctx.arc(point.x, point.y, GRIP_VISUAL_RADIUS_PX, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = annotation.style.color;
          ctx.stroke();
        }

        continue;
      }

      const bounds = tool?.bounds?.(ctx, annotation);

      if (bounds) {
        ctx.save();
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        ctx.strokeStyle = annotation.style.color;
        ctx.strokeRect(bounds.left - 3, bounds.top - 3, bounds.width + 6, bounds.height + 6);
        ctx.restore();
      }
    }
  }

  private undo(): void {
    // Mid-drag undo would leave `moving` pointing at a list that no longer matches.
    if (this.moving) {
      return;
    }

    if (this.history.undo()) {
      // Indices may no longer exist (or hold different annotations) after undo.
      this.hoveredIndex = null;
      this.selectedIndex = null;
      this.repaint();
    }
  }

  private clearAll(): void {
    this.history.clear();
    this.hoveredIndex = null;
    this.selectedIndex = null;
    this.repaint();
  }

  /** Deletes the selected annotation (Delete/Backspace) as one undoable step. */
  private deleteSelected(): void {
    if (this.selectedIndex === null || this.moving) {
      return;
    }

    this.history.remove(this.selectedIndex);
    this.selectedIndex = null;
    this.hoveredIndex = null;
    this.repaint();
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();

      // Esc backs out one layer at a time: text entry, crop draft, then selection, then the editor.
      if (this.textDraft) {
        this.cancelTextDraft();

        return;
      }

      if (this.cropDraft) {
        this.cancelCropDraft();

        return;
      }

      if (this.selectedIndex !== null) {
        this.selectIndex(null);

        return;
      }

      this.callbacks.onClose();

      return;
    }

    if ((event.key === 'Delete' || event.key === 'Backspace') && !this.textDraft) {
      if (this.selectedIndex !== null) {
        event.preventDefault();
        event.stopPropagation();
        this.deleteSelected();

        return;
      }
    }

    // While typing, Ctrl+Z belongs to the textarea's native undo, not annotation history —
    // it falls through to the barrier below like any other editor-bound key.
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !this.textDraft) {
      event.preventDefault();
      event.stopPropagation();
      this.undo();

      return;
    }

    if (event.key === 'Enter' && this.hasValidCropDraft() && !this.textDraft) {
      event.preventDefault();
      event.stopPropagation();
      void this.applyCrop();

      return;
    }

    // Outer half of the modal keyboard barrier for keydown (see onKeyGuard): anything not
    // headed into the editor's own DOM must not reach the page's hotkey handlers.
    if (!this.isInsideEditor(event)) {
      event.stopPropagation();
    }
  }

  /**
   * Whether the event's REAL target lives inside the editor. composedPath pierces the open
   * shadow boundary, so this works from a window-level listener where `event.target` has
   * already been retargeted to the shadow host.
   */
  private isInsideEditor(event: Event): boolean {
    const target =
      typeof event.composedPath === 'function' ? event.composedPath()[0] : event.target;

    return target instanceof Node && this.root.contains(target);
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
        annotations: this.history.list(),
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
