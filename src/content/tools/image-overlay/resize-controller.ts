import type { OverlayTransform, ResizeCorner } from './overlay-geometry';
import { computeUniformResize } from './overlay-geometry';

/**
 * Resize controller for the overlay corner handles (spec §7, RF-OVL-1). Mirrors {@link DragController}:
 * each handle uses Pointer Events + setPointerCapture on the handle element itself — never `mouse*`
 * listeners on `document` — and live updates are coalesced with requestAnimationFrame.
 *
 * The dragged corner's opposite corner stays pinned; the math lives in `computeUniformResize` so it
 * is pure and unit-testable. The offset/scale captured at gesture start keep that anchor fixed for
 * the whole gesture.
 */

export interface ResizeCallbacks {
  /** Called on every animation frame with the in-progress transform (for live preview). */
  onPreview: (transform: OverlayTransform) => void;
  /** Called once when the gesture ends with the final transform (triggers persistence). */
  onCommit: (transform: OverlayTransform) => void;
}

export class ResizeController {
  private readonly handleCorners = new Map<HTMLElement, ResizeCorner>();
  private activePointerId: number | null = null;
  private activeHandle: HTMLElement | null = null;
  private activeCorner: ResizeCorner | null = null;
  private startOffsetX = 0;
  private startOffsetY = 0;
  private startScale = 1;
  private latest: OverlayTransform | null = null;
  private rafHandle: number | null = null;

  private readonly onPointerDown = (event: PointerEvent): void => this.handlePointerDown(event);
  private readonly onPointerMove = (event: PointerEvent): void => this.handlePointerMove(event);
  private readonly onPointerUp = (event: PointerEvent): void => this.handlePointerUp(event);
  private readonly onPointerCancel = (event: PointerEvent): void => this.handlePointerUp(event);

  constructor(
    private readonly callbacks: ResizeCallbacks,
    /** Reads the committed offset/scale at gesture start. */
    private readonly getState: () => { offsetX: number; offsetY: number; scale: number },
    /** Reads the image's natural size; the gesture is a no-op until the image has loaded. */
    private readonly getNaturalSize: () => { width: number; height: number },
  ) {}

  /** Registers a corner handle and starts listening on it. */
  addHandle(handle: HTMLElement, corner: ResizeCorner): void {
    this.handleCorners.set(handle, corner);
    handle.addEventListener('pointerdown', this.onPointerDown);
    handle.addEventListener('pointermove', this.onPointerMove);
    handle.addEventListener('pointerup', this.onPointerUp);
    handle.addEventListener('pointercancel', this.onPointerCancel);
  }

  detach(): void {
    this.cancelFrame();

    for (const handle of this.handleCorners.keys()) {
      handle.removeEventListener('pointerdown', this.onPointerDown);
      handle.removeEventListener('pointermove', this.onPointerMove);
      handle.removeEventListener('pointerup', this.onPointerUp);
      handle.removeEventListener('pointercancel', this.onPointerCancel);
    }

    this.handleCorners.clear();
  }

  private handlePointerDown(event: PointerEvent): void {
    const handle = event.currentTarget as HTMLElement;
    const corner = this.handleCorners.get(handle);

    if (!corner || event.button !== 0) {
      return;
    }

    const natural = this.getNaturalSize();

    if (natural.width === 0 || natural.height === 0) {
      return;
    }

    // Keep the press from reaching the overlay root, where it would start a move drag instead.
    event.stopPropagation();
    event.preventDefault();

    const { offsetX, offsetY, scale } = this.getState();
    this.activePointerId = event.pointerId;
    this.activeHandle = handle;
    this.activeCorner = corner;
    this.startOffsetX = offsetX;
    this.startOffsetY = offsetY;
    this.startScale = scale;
    this.latest = { scale, offsetX, offsetY };

    try {
      handle.setPointerCapture(event.pointerId);
    } catch {
      // setPointerCapture unavailable — resize still works while the pointer stays on the handle.
    }
  }

  private handlePointerMove(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId || !this.activeCorner) {
      return;
    }

    const natural = this.getNaturalSize();

    this.latest = computeUniformResize({
      corner: this.activeCorner,
      naturalWidth: natural.width,
      naturalHeight: natural.height,
      startOffsetX: this.startOffsetX,
      startOffsetY: this.startOffsetY,
      startScale: this.startScale,
      pointerX: event.clientX,
      pointerY: event.clientY,
    });

    this.scheduleFrame();
  }

  private handlePointerUp(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) {
      return;
    }

    this.cancelFrame();

    try {
      this.activeHandle?.releasePointerCapture(event.pointerId);
    } catch {
      // Already released or never captured — nothing to undo.
    }

    const final = this.latest;
    this.activePointerId = null;
    this.activeHandle = null;
    this.activeCorner = null;

    if (final) {
      this.callbacks.onCommit(final);
    }
  }

  private scheduleFrame(): void {
    if (this.rafHandle !== null) {
      return;
    }

    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = null;

      if (this.latest) {
        this.callbacks.onPreview(this.latest);
      }
    });
  }

  private cancelFrame(): void {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }
}
