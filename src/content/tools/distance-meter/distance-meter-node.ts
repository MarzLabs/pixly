import { SHADOW_HOST_ID } from '@shared/constants';
import type {
  DistanceMeterState,
  Measurement,
  MeasurementSegment,
  SnapTargetRect,
} from '@shared/types';
import type { EdgeRect } from './distance-geometry';
import {
  computeDelta,
  describeElement,
  formatMeasurementLabel,
  lineTransform,
  MAX_MEASUREMENTS,
  METER_COLOR,
  MIN_MEASUREMENT_PX,
  rectsEqual,
  segmentMidpoint,
  applyAxisLock,
  snapToRectEdges,
} from './distance-geometry';

/** Fill alpha (hex byte appended to METER_COLOR) for the snapped element's highlight box. */
const SNAP_HIGHLIGHT_ALPHA_HEX = '14';

/** Minimum document-y room needed to place the identity tag above the highlight box. */
const TAG_CLEARANCE_PX = 20;

export interface DistanceMeterCallbacks {
  /** Called whenever the committed measurement list changes (add, single delete, drop-oldest). */
  onMeasurementsCommit: (measurements: Measurement[]) => void;
}

/** A pointer position resolved to document coordinates; `rect`/`description` only when snapped. */
interface SnapResult {
  x: number;
  y: number;
  rect: EdgeRect | null;
  description: string | null;
}

/**
 * Owns the Distance Meter DOM inside the Shadow DOM (RF-CORE-2), all imperative. A viewport-fixed
 * crosshair surface captures measuring drags; committed figures (line, endpoint dots, readout
 * label, dashed snap echoes) live in a document-anchored layer sized in explicit pixels (0×0 host
 * caveat) so they scroll with the content they measured. The layer sits after the surface in DOM
 * order, so the labels — the delete affordance of each measurement — stay clickable above it.
 *
 * Gestures follow the project rule: pointer capture + pointercancel + lostpointercapture + a
 * buttons===0 stale-gesture check. Escape aborts the in-flight gesture (committed measurements
 * are untouched). Endpoints snap to element edges within the configurable radius; snapping and
 * its feedback (element highlight + identity tag + landing ghost dot) are disabled at radius 0.
 */
export class DistanceMeterNode {
  private readonly surface: HTMLDivElement;
  private readonly layer: HTMLDivElement;
  private readonly committedContainer: HTMLDivElement;
  private readonly previewFigure: HTMLDivElement;
  private readonly previewLine: HTMLDivElement;
  private readonly previewDotA: HTMLDivElement;
  private readonly previewDotB: HTMLDivElement;
  private readonly previewLabel: HTMLDivElement;
  private readonly highlight: HTMLDivElement;
  private readonly highlightTag: HTMLDivElement;
  private readonly ghostDot: HTMLDivElement;
  private readonly callbacks: DistanceMeterCallbacks;
  private readonly resizeObserver: ResizeObserver;
  private measurements: Measurement[] = [];
  private figureElements: HTMLDivElement[] = [];
  private snapRadiusPx = 0;
  private gestureActive = false;
  private hoverFrame: number | null = null;
  private readonly onResize = (): void => this.syncLayerSize();
  private readonly onSurfaceDown = (event: PointerEvent): void => this.beginGesture(event);
  private readonly onSurfaceHover = (event: PointerEvent): void => this.scheduleHover(event);
  private readonly onSurfaceLeave = (): void => this.hideSnapFeedback();

  constructor(
    parent: HTMLElement,
    initialState: DistanceMeterState,
    callbacks: DistanceMeterCallbacks,
  ) {
    this.callbacks = callbacks;

    this.layer = document.createElement('div');
    this.layer.className = 'pixly-meter-layer';
    this.layer.style.color = METER_COLOR;

    this.committedContainer = document.createElement('div');

    // Preview figure: reused for the in-flight gesture, promoted to a committed figure on finish.
    this.previewFigure = document.createElement('div');
    this.previewFigure.className = 'pixly-meter-figure pixly-meter-figure--hidden';
    this.previewLine = document.createElement('div');
    this.previewLine.className = 'pixly-meter-line';
    this.previewDotA = document.createElement('div');
    this.previewDotA.className = 'pixly-meter-dot';
    this.previewDotB = document.createElement('div');
    this.previewDotB.className = 'pixly-meter-dot';
    this.previewLabel = document.createElement('div');
    this.previewLabel.className = 'pixly-meter-label';
    this.previewFigure.append(
      this.previewLine,
      this.previewDotA,
      this.previewDotB,
      this.previewLabel,
    );

    // Snap feedback: a box over the element whose edge the point would snap to (with an identity
    // tag naming that element), plus a hollow dot at the exact landing position — visible on
    // hover BEFORE pressing, so the start point's snap is as observable as the end point's.
    this.highlight = document.createElement('div');
    this.highlight.className = 'pixly-meter-highlight';
    this.highlight.style.border = `1px solid ${METER_COLOR}`;
    this.highlight.style.background = `${METER_COLOR}${SNAP_HIGHLIGHT_ALPHA_HEX}`;

    this.highlightTag = document.createElement('div');
    this.highlightTag.className = 'pixly-meter-highlight__tag';
    this.highlightTag.style.background = METER_COLOR;
    this.highlight.appendChild(this.highlightTag);

    this.ghostDot = document.createElement('div');
    this.ghostDot.className = 'pixly-meter-dot pixly-meter-dot--ghost';

    this.layer.append(this.committedContainer, this.highlight, this.previewFigure, this.ghostDot);

    this.surface = document.createElement('div');
    this.surface.className = 'pixly-meter-surface';
    this.surface.addEventListener('pointerdown', this.onSurfaceDown);
    this.surface.addEventListener('pointermove', this.onSurfaceHover);
    this.surface.addEventListener('pointerleave', this.onSurfaceLeave);

    // Surface first, layer second: labels (pointer-events: auto) win the hit test over the
    // surface, everything else in the layer stays pointer-transparent and falls through.
    parent.append(this.surface, this.layer);

    window.addEventListener('resize', this.onResize);
    this.resizeObserver = new ResizeObserver(() => this.syncLayerSize());
    this.resizeObserver.observe(document.documentElement);

    this.update(initialState);
    this.syncLayerSize();
  }

  /** Applies the full state: pause flag, snap radius, and the committed measurement list. */
  update(state: DistanceMeterState): void {
    this.surface.classList.toggle('pixly-meter-surface--paused', state.paused);
    this.snapRadiusPx = state.snapRadiusPx;
    this.measurements = state.measurements.map(copyMeasurement);
    this.renderCommitted();

    if (state.paused) {
      this.hideSnapFeedback();
    }
  }

  destroy(): void {
    if (this.hoverFrame !== null) {
      cancelAnimationFrame(this.hoverFrame);
    }

    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.onResize);
    this.surface.removeEventListener('pointerdown', this.onSurfaceDown);
    this.surface.removeEventListener('pointermove', this.onSurfaceHover);
    this.surface.removeEventListener('pointerleave', this.onSurfaceLeave);
    this.surface.remove();
    this.layer.remove();
  }

  private syncLayerSize(): void {
    this.layer.style.width = `${document.documentElement.scrollWidth}px`;
    this.layer.style.height = `${document.documentElement.scrollHeight}px`;
  }

  /** Rebuilds all committed figures; measurement counts are small, so rebuild stays cheap. */
  private renderCommitted(): void {
    this.figureElements = this.measurements.map((measurement, index) =>
      this.createFigure(measurement, index),
    );
    this.committedContainer.replaceChildren(...this.figureElements);
  }

  /**
   * Temporarily accents one committed figure so the panel's list rows can point at it on hover;
   * null clears the accent. Rebuilds reset it naturally.
   */
  setHoverAccent(index: number | null): void {
    this.figureElements.forEach((element, current) =>
      element.classList.toggle('pixly-meter-figure--accent', current === index),
    );
  }

  private createFigure(measurement: Measurement, index: number): HTMLDivElement {
    const figure = document.createElement('div');
    figure.className = 'pixly-meter-figure';

    // Dashed echoes over the snapped elements; one box when both endpoints share the element.
    const endSnap = rectsEqual(measurement.startSnap, measurement.endSnap)
      ? null
      : measurement.endSnap;

    for (const rect of [measurement.startSnap, endSnap]) {
      if (rect) {
        const echo = document.createElement('div');
        echo.className = 'pixly-meter-echo';
        applyRect(echo, rect);
        figure.appendChild(echo);
      }
    }

    const line = document.createElement('div');
    line.className = 'pixly-meter-line';
    const dotA = document.createElement('div');
    dotA.className = 'pixly-meter-dot';
    const dotB = document.createElement('div');
    dotB.className = 'pixly-meter-dot';

    const label = document.createElement('div');
    label.className = 'pixly-meter-label pixly-meter-label--action';
    label.title = 'Remove this measurement';
    label.addEventListener('pointerdown', (event) => event.stopPropagation());
    label.addEventListener('click', () => this.removeMeasurement(index));

    figure.append(line, dotA, dotB, label);
    applySegment({ line, dotA, dotB, label }, measurement.segment);

    return figure;
  }

  private removeMeasurement(index: number): void {
    this.measurements.splice(index, 1);
    this.renderCommitted();
    this.commitMeasurements();
  }

  private commitMeasurements(): void {
    this.callbacks.onMeasurementsCommit(this.measurements.map(copyMeasurement));
  }

  /** Pre-press hover feedback, rAF-throttled. The active gesture drives its own feedback. */
  private scheduleHover(event: PointerEvent): void {
    if (this.gestureActive || this.hoverFrame !== null) {
      return;
    }

    this.hoverFrame = requestAnimationFrame(() => {
      this.hoverFrame = null;

      if (!this.gestureActive) {
        this.showSnapFeedback(this.resolveSnap(event), true);
      }
    });
  }

  /** Shows the snapped element's box + identity tag, and (on hover only) the landing ghost dot. */
  private showSnapFeedback(snap: SnapResult, withGhost: boolean): void {
    if (!snap.rect) {
      this.hideSnapFeedback();

      return;
    }

    this.highlight.style.display = 'block';
    applyRect(this.highlight, snap.rect);

    // The identity tag sits above the box, or inside it when the box touches the document top.
    this.highlightTag.textContent = snap.description ?? '';
    this.highlightTag.classList.toggle(
      'pixly-meter-highlight__tag--inside',
      snap.rect.top < TAG_CLEARANCE_PX,
    );

    if (withGhost) {
      this.ghostDot.style.display = 'block';
      this.ghostDot.style.left = `${snap.x}px`;
      this.ghostDot.style.top = `${snap.y}px`;
    } else {
      this.ghostDot.style.display = 'none';
    }
  }

  private hideSnapFeedback(): void {
    this.highlight.style.display = 'none';
    this.ghostDot.style.display = 'none';
  }

  /** One measuring drag, from pointerdown to any of its endings. Listeners are gesture-scoped. */
  private beginGesture(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();

    const pointerId = event.pointerId;
    const start = this.resolveSnap(event);
    let segment: MeasurementSegment = { ax: start.x, ay: start.y, bx: start.x, by: start.y };
    let latestEndSnap: SnapTargetRect | null = null;
    let frameHandle: number | null = null;

    this.gestureActive = true;
    this.showSnapFeedback(start, false);

    try {
      this.surface.setPointerCapture(pointerId);
    } catch {
      // Capture unavailable — measuring still works while the pointer stays on the surface.
    }

    const preview = (): void => {
      frameHandle = null;
      this.previewFigure.classList.remove('pixly-meter-figure--hidden');
      applySegment(
        {
          line: this.previewLine,
          dotA: this.previewDotA,
          dotB: this.previewDotB,
          label: this.previewLabel,
        },
        segment,
      );
    };

    const cleanup = (): void => {
      if (frameHandle !== null) {
        cancelAnimationFrame(frameHandle);
      }

      this.gestureActive = false;
      this.previewFigure.classList.add('pixly-meter-figure--hidden');
      this.hideSnapFeedback();
      this.surface.removeEventListener('pointermove', onMove);
      this.surface.removeEventListener('pointerup', onUp);
      this.surface.removeEventListener('pointercancel', onAbort);
      this.surface.removeEventListener('lostpointercapture', onAbort);
      window.removeEventListener('keydown', onKeyDown, true);

      try {
        this.surface.releasePointerCapture(pointerId);
      } catch {
        // Already released.
      }
    };

    const finish = (): void => {
      cleanup();

      // A no-travel tap adds nothing; committed measurements are removed via their labels.
      if (computeDelta(segment).distance < MIN_MEASUREMENT_PX) {
        return;
      }

      this.measurements.push({ segment, startSnap: start.rect, endSnap: latestEndSnap });

      // Bounded history: the oldest measurement makes room for the newest.
      if (this.measurements.length > MAX_MEASUREMENTS) {
        this.measurements.shift();
      }

      this.renderCommitted();
      this.commitMeasurements();
    };

    /** Abort (Escape / pointercancel / capture loss): the in-flight preview simply vanishes. */
    const abort = (): void => {
      cleanup();
    };

    const onMove = (moveEvent: PointerEvent): void => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }

      // Stale gesture (pointerup lost): finish at the current segment instead of hover-measuring.
      if (moveEvent.buttons === 0) {
        finish();

        return;
      }

      const end = this.resolveSnap(moveEvent);
      segment = { ax: segment.ax, ay: segment.ay, bx: end.x, by: end.y };
      latestEndSnap = end.rect;

      if (moveEvent.shiftKey) {
        segment = applyAxisLock(segment);
      }

      this.showSnapFeedback(end, false);

      if (frameHandle === null) {
        frameHandle = requestAnimationFrame(preview);
      }
    };

    const onUp = (upEvent: PointerEvent): void => {
      if (upEvent.pointerId === pointerId) {
        finish();
      }
    };

    const onAbort = (abortEvent: PointerEvent): void => {
      if (abortEvent.pointerId === pointerId) {
        abort();
      }
    };

    const onKeyDown = (keyEvent: KeyboardEvent): void => {
      if (keyEvent.key === 'Escape') {
        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        abort();
      }
    };

    this.surface.addEventListener('pointermove', onMove);
    this.surface.addEventListener('pointerup', onUp);
    this.surface.addEventListener('pointercancel', onAbort);
    this.surface.addEventListener('lostpointercapture', onAbort);
    window.addEventListener('keydown', onKeyDown, true);

    preview();
  }

  /**
   * Pointer position in document coordinates, snapped to the nearest edges of the page element
   * under the cursor. `elementsFromPoint` sees through the meter surface: the first hit is
   * Pixly's shadow host, so the first non-host element is the page's. The element's rect and
   * identity are returned only when an edge actually snapped, and drive the highlight feedback.
   */
  private resolveSnap(event: PointerEvent): SnapResult {
    const documentX = event.clientX + window.scrollX;
    const documentY = event.clientY + window.scrollY;
    const unSnapped: SnapResult = {
      x: Math.round(documentX),
      y: Math.round(documentY),
      rect: null,
      description: null,
    };

    if (this.snapRadiusPx === 0) {
      return unSnapped;
    }

    const target = document
      .elementsFromPoint(event.clientX, event.clientY)
      .find((element) => element.id !== SHADOW_HOST_ID);

    if (!target) {
      return unSnapped;
    }

    const clientRect = target.getBoundingClientRect();
    const rect: EdgeRect = {
      left: clientRect.left + window.scrollX,
      top: clientRect.top + window.scrollY,
      right: clientRect.right + window.scrollX,
      bottom: clientRect.bottom + window.scrollY,
    };
    const snapped = snapToRectEdges(documentX, documentY, rect, this.snapRadiusPx);
    const didSnap = snapped.x !== documentX || snapped.y !== documentY;

    if (!didSnap) {
      return unSnapped;
    }

    return {
      x: Math.round(snapped.x),
      y: Math.round(snapped.y),
      rect,
      description: describeElement({
        tagName: target.tagName,
        id: target.id,
        classNames: Array.from(target.classList),
        width: clientRect.width,
        height: clientRect.height,
      }),
    };
  }
}

interface FigureParts {
  line: HTMLDivElement;
  dotA: HTMLDivElement;
  dotB: HTMLDivElement;
  label: HTMLDivElement;
}

/** Positions one figure's parts (line, dots, midpoint label) from its segment. */
function applySegment(parts: FigureParts, segment: MeasurementSegment): void {
  const { length, angleDeg } = lineTransform(segment);
  parts.line.style.transform = `translate(${segment.ax}px, ${segment.ay}px) rotate(${angleDeg}deg)`;
  parts.line.style.width = `${length}px`;

  parts.dotA.style.left = `${segment.ax}px`;
  parts.dotA.style.top = `${segment.ay}px`;
  parts.dotB.style.left = `${segment.bx}px`;
  parts.dotB.style.top = `${segment.by}px`;

  const midpoint = segmentMidpoint(segment);
  parts.label.style.left = `${midpoint.x}px`;
  parts.label.style.top = `${midpoint.y}px`;
  parts.label.textContent = formatMeasurementLabel(computeDelta(segment));
}

function applyRect(element: HTMLElement, rect: SnapTargetRect): void {
  element.style.display = 'block';
  element.style.left = `${rect.left}px`;
  element.style.top = `${rect.top}px`;
  element.style.width = `${rect.right - rect.left}px`;
  element.style.height = `${rect.bottom - rect.top}px`;
}

function copyMeasurement(measurement: Measurement): Measurement {
  return {
    segment: { ...measurement.segment },
    startSnap: measurement.startSnap ? { ...measurement.startSnap } : null,
    endSnap: measurement.endSnap ? { ...measurement.endSnap } : null,
  };
}
