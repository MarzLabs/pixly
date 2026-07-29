import { DESIGN_TOKENS } from '@shared/constants/design-tokens';
import type { GuideAxis, GuideLine, RulersGuidesState } from '@shared/types';
import {
  clampGuidePosition,
  firstTickAt,
  GUIDE_COLOR,
  guideDropDeletes,
  isMajorTick,
  MINOR_TICK_INTERVAL_PX,
  RULER_THICKNESS_PX,
  tickLengthFor,
} from './ruler-geometry';

/** Canvas text styling for tick labels. */
const TICK_FONT = `9px ${DESIGN_TOKENS.fontFamily}`;
const TICK_LABEL_OFFSET_PX = 2;
const TICK_LABEL_BASELINE_PX = 9;
/** Crisp 1px canvas lines need half-pixel alignment. */
const CANVAS_LINE_CENTER = 0.5;
/** Offset centering the 1px line inside the guide's 5px hit area (sizes live in shadow-ui.css). */
const GUIDE_LINE_CENTER_PX = 2;
/** Offset of the position label from the pointer while dragging a guide. */
const GUIDE_LABEL_OFFSET_PX = 8;

export interface RulersGuidesCallbacks {
  /** Called when a guide gesture ends (created, moved, or deleted) with the full guide list. */
  onGuidesCommit: (guides: GuideLine[]) => void;
}

/**
 * Owns the rulers + guides DOM inside the Shadow DOM (RF-CORE-2), all imperative. The two rulers
 * are viewport-fixed canvases redrawn on scroll/resize so tick numbers always show document
 * coordinates. Guides live in a document-anchored layer (they scroll with the page) whose size is
 * kept in explicit pixels — the 0×0 shadow host makes percentage sizes resolve to 0.
 *
 * Gestures follow the project rule: pointer capture + pointercancel + lostpointercapture + a
 * buttons===0 stale-gesture check, so a guide drag can never go zombie.
 */
export class RulersGuidesNode {
  private readonly root: HTMLDivElement;
  private readonly topRuler: HTMLCanvasElement;
  private readonly leftRuler: HTMLCanvasElement;
  private readonly corner: HTMLDivElement;
  private readonly guidesLayer: HTMLDivElement;
  private readonly callbacks: RulersGuidesCallbacks;
  private readonly resizeObserver: ResizeObserver;
  private guides: GuideLine[] = [];
  private rulersVisible = true;
  private redrawHandle: number | null = null;
  private readonly onScroll = (): void => this.scheduleRedraw();
  private readonly onResize = (): void => this.syncGeometry();
  private readonly onTopRulerDown = (event: PointerEvent): void =>
    this.beginGuideCreation('horizontal', event);
  private readonly onLeftRulerDown = (event: PointerEvent): void =>
    this.beginGuideCreation('vertical', event);

  constructor(
    parent: HTMLElement,
    initialState: RulersGuidesState,
    callbacks: RulersGuidesCallbacks,
  ) {
    this.callbacks = callbacks;

    this.root = document.createElement('div');
    this.root.className = 'pixly-rulers';

    this.guidesLayer = document.createElement('div');
    this.guidesLayer.className = 'pixly-guides-layer';
    this.guidesLayer.style.color = GUIDE_COLOR;
    this.root.appendChild(this.guidesLayer);

    this.topRuler = document.createElement('canvas');
    this.topRuler.className = 'pixly-ruler pixly-ruler--top';
    this.root.appendChild(this.topRuler);

    this.leftRuler = document.createElement('canvas');
    this.leftRuler.className = 'pixly-ruler pixly-ruler--left';
    this.root.appendChild(this.leftRuler);

    this.corner = document.createElement('div');
    this.corner.className = 'pixly-rulers-corner';
    this.root.appendChild(this.corner);

    parent.appendChild(this.root);

    this.topRuler.addEventListener('pointerdown', this.onTopRulerDown);
    this.leftRuler.addEventListener('pointerdown', this.onLeftRulerDown);
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onResize);

    this.resizeObserver = new ResizeObserver(() => this.syncGeometry());
    this.resizeObserver.observe(document.documentElement);

    this.update(initialState);
    this.syncGeometry();
  }

  /** Applies the full state: ruler visibility and the guide set. */
  update(state: RulersGuidesState): void {
    this.rulersVisible = state.rulersVisible;
    this.guides = state.guides.map((guide) => ({ ...guide }));

    const hidden = !this.rulersVisible;
    this.topRuler.classList.toggle('pixly-ruler--hidden', hidden);
    this.leftRuler.classList.toggle('pixly-ruler--hidden', hidden);
    this.corner.classList.toggle('pixly-ruler--hidden', hidden);

    this.rebuildGuideElements();
    this.scheduleRedraw();
  }

  destroy(): void {
    if (this.redrawHandle !== null) {
      cancelAnimationFrame(this.redrawHandle);
    }

    this.resizeObserver.disconnect();
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onResize);
    this.topRuler.removeEventListener('pointerdown', this.onTopRulerDown);
    this.leftRuler.removeEventListener('pointerdown', this.onLeftRulerDown);
    this.root.remove();
  }

  /** Resizes canvases (device-pixel-ratio aware) and the guides layer, then repaints. */
  private syncGeometry(): void {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    this.topRuler.width = viewportWidth * dpr;
    this.topRuler.height = RULER_THICKNESS_PX * dpr;
    this.topRuler.style.width = `${viewportWidth}px`;
    this.topRuler.style.height = `${RULER_THICKNESS_PX}px`;

    this.leftRuler.width = RULER_THICKNESS_PX * dpr;
    this.leftRuler.height = viewportHeight * dpr;
    this.leftRuler.style.width = `${RULER_THICKNESS_PX}px`;
    this.leftRuler.style.height = `${viewportHeight}px`;

    this.guidesLayer.style.width = `${document.documentElement.scrollWidth}px`;
    this.guidesLayer.style.height = `${document.documentElement.scrollHeight}px`;

    this.scheduleRedraw();
  }

  private scheduleRedraw(): void {
    if (this.redrawHandle !== null) {
      return;
    }

    this.redrawHandle = requestAnimationFrame(() => {
      this.redrawHandle = null;
      this.redraw();
    });
  }

  private redraw(): void {
    if (!this.rulersVisible) {
      return;
    }

    this.drawRuler(this.topRuler, 'horizontal');
    this.drawRuler(this.leftRuler, 'vertical');
  }

  /**
   * Paints one ruler: background, edge line, and ticks labeled in document coordinates. The
   * `along` axis is the one the ruler measures ('horizontal' = the top ruler measuring x).
   */
  private drawRuler(canvas: HTMLCanvasElement, along: 'horizontal' | 'vertical'): void {
    const context = canvas.getContext('2d');

    if (!context) {
      return;
    }

    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const isTop = along === 'horizontal';
    const lengthPx = isTop
      ? document.documentElement.clientWidth
      : document.documentElement.clientHeight;
    const scrollPx = isTop ? window.scrollX : window.scrollY;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);

    const width = isTop ? lengthPx : RULER_THICKNESS_PX;
    const height = isTop ? RULER_THICKNESS_PX : lengthPx;
    context.fillStyle = DESIGN_TOKENS.colorSurface;
    context.fillRect(0, 0, width, height);

    context.strokeStyle = DESIGN_TOKENS.colorBorder;
    context.beginPath();

    if (isTop) {
      context.moveTo(0, RULER_THICKNESS_PX - CANVAS_LINE_CENTER);
      context.lineTo(width, RULER_THICKNESS_PX - CANVAS_LINE_CENTER);
    } else {
      context.moveTo(RULER_THICKNESS_PX - CANVAS_LINE_CENTER, 0);
      context.lineTo(RULER_THICKNESS_PX - CANVAS_LINE_CENTER, height);
    }

    context.stroke();

    context.strokeStyle = DESIGN_TOKENS.colorTextMuted;
    context.fillStyle = DESIGN_TOKENS.colorTextMuted;
    context.font = TICK_FONT;
    context.beginPath();

    const end = scrollPx + lengthPx;

    for (
      let position = firstTickAt(scrollPx, MINOR_TICK_INTERVAL_PX);
      position <= end;
      position += MINOR_TICK_INTERVAL_PX
    ) {
      const viewportOffset = position - scrollPx + CANVAS_LINE_CENTER;
      const tickLength = tickLengthFor(position);

      if (isTop) {
        context.moveTo(viewportOffset, RULER_THICKNESS_PX);
        context.lineTo(viewportOffset, RULER_THICKNESS_PX - tickLength);
      } else {
        context.moveTo(RULER_THICKNESS_PX, viewportOffset);
        context.lineTo(RULER_THICKNESS_PX - tickLength, viewportOffset);
      }

      if (isMajorTick(position)) {
        if (isTop) {
          context.fillText(
            String(position),
            viewportOffset + TICK_LABEL_OFFSET_PX,
            TICK_LABEL_BASELINE_PX,
          );
        } else {
          context.save();
          context.translate(TICK_LABEL_BASELINE_PX, viewportOffset - TICK_LABEL_OFFSET_PX);
          context.rotate(-Math.PI / 2);
          context.fillText(String(position), 0, 0);
          context.restore();
        }
      }
    }

    context.stroke();
  }

  private rebuildGuideElements(): void {
    this.guidesLayer.replaceChildren();

    for (const guide of this.guides) {
      this.guidesLayer.appendChild(this.createGuideElement(guide));
    }
  }

  private createGuideElement(guide: GuideLine): HTMLDivElement {
    const element = document.createElement('div');
    element.className = `pixly-guide pixly-guide--${guide.axis}`;
    this.applyGuidePosition(element, guide);

    element.addEventListener('pointerdown', (event: PointerEvent) => {
      if (event.button === 0) {
        event.preventDefault();
        this.runGuideDrag(element, guide, event, false);
      }
    });

    return element;
  }

  private applyGuidePosition(element: HTMLElement, guide: GuideLine): void {
    if (guide.axis === 'vertical') {
      element.style.left = `${guide.positionPx - GUIDE_LINE_CENTER_PX}px`;
    } else {
      element.style.top = `${guide.positionPx - GUIDE_LINE_CENTER_PX}px`;
    }
  }

  /** Ruler press: spawn a new guide under the pointer and hand it the rest of the gesture. */
  private beginGuideCreation(axis: GuideAxis, event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();

    const guide: GuideLine = { axis, positionPx: this.positionFromEvent(axis, event) };
    const element = this.createGuideElement(guide);
    this.guidesLayer.appendChild(element);

    this.runGuideDrag(element, guide, event, true);
  }

  /**
   * Drives one guide gesture from the triggering pointerdown to its end. Listeners are
   * gesture-scoped: attached here, removed on any of the four possible endings.
   */
  private runGuideDrag(
    element: HTMLElement,
    guide: GuideLine,
    event: PointerEvent,
    isNew: boolean,
  ): void {
    const pointerId = event.pointerId;

    try {
      element.setPointerCapture(pointerId);
    } catch {
      // Capture unavailable — the drag still works while the pointer stays on the guide.
    }

    const label = document.createElement('div');
    label.className = 'pixly-guide__label';
    element.appendChild(label);

    const updateVisuals = (moveEvent: PointerEvent): void => {
      guide.positionPx = this.positionFromEvent(guide.axis, moveEvent);
      this.applyGuidePosition(element, guide);
      label.textContent = `${guide.axis === 'vertical' ? 'x' : 'y'}: ${guide.positionPx}px`;

      if (guide.axis === 'vertical') {
        label.style.top = `${moveEvent.clientY + window.scrollY + GUIDE_LABEL_OFFSET_PX}px`;
        label.style.left = `${GUIDE_LABEL_OFFSET_PX}px`;
      } else {
        label.style.left = `${moveEvent.clientX + window.scrollX + GUIDE_LABEL_OFFSET_PX}px`;
        label.style.top = `${GUIDE_LABEL_OFFSET_PX}px`;
      }
    };

    const cleanup = (): void => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onUp);
      element.removeEventListener('pointercancel', onAbort);
      element.removeEventListener('lostpointercapture', onAbort);
      label.remove();

      try {
        element.releasePointerCapture(pointerId);
      } catch {
        // Already released.
      }
    };

    /** Normal ending: dropping on the source ruler deletes, anywhere else commits the position. */
    const finish = (endEvent: PointerEvent): void => {
      cleanup();

      if (guideDropDeletes(guide.axis, endEvent.clientX, endEvent.clientY)) {
        element.remove();

        if (!isNew) {
          this.guides = this.guides.filter((existing) => existing !== guide);
        }
      } else if (isNew) {
        this.guides.push(guide);
      }

      this.callbacks.onGuidesCommit(this.guides.map((existing) => ({ ...existing })));
    };

    /** Abnormal ending (cancel / capture loss): keep the guide where it is, never delete it. */
    const abort = (): void => {
      cleanup();

      if (isNew) {
        this.guides.push(guide);
      }

      this.callbacks.onGuidesCommit(this.guides.map((existing) => ({ ...existing })));
    };

    const onMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }

      // Stale gesture (pointerup lost): finish at the current position instead of hover-dragging.
      if (moveEvent.buttons === 0) {
        finish(moveEvent);

        return;
      }

      updateVisuals(moveEvent);
    };

    const onUp = (upEvent: PointerEvent): void => {
      if (upEvent.pointerId === pointerId) {
        finish(upEvent);
      }
    };

    const onAbort = (abortEvent: PointerEvent): void => {
      if (abortEvent.pointerId === pointerId) {
        abort();
      }
    };

    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onAbort);
    element.addEventListener('lostpointercapture', onAbort);

    updateVisuals(event);
  }

  /** Document-space position for a pointer event along the guide's axis, clamped to the page. */
  private positionFromEvent(axis: GuideAxis, event: PointerEvent): number {
    if (axis === 'vertical') {
      return clampGuidePosition(
        event.clientX + window.scrollX,
        document.documentElement.scrollWidth,
      );
    }

    return clampGuidePosition(
      event.clientY + window.scrollY,
      document.documentElement.scrollHeight,
    );
  }
}
