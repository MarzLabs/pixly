/**
 * Drag controller for the overlay node (RF-OVL-1). Uses Pointer Events + setPointerCapture on the
 * overlay element itself — never `mouse*` listeners on `document` — so a pointerup outside the
 * element is never missed and the overlay cannot "ghost-follow" the cursor to the top-left.
 *
 * Live position updates during a drag are coalesced with requestAnimationFrame so even fast drags
 * stay smooth, and the committed offset is reported only when the gesture ends.
 */

export interface DragCallbacks {
  /** Called on every animation frame with the in-progress offset (for live preview). */
  onPreview: (offsetX: number, offsetY: number) => void;
  /** Called once when the drag ends with the final committed offset (triggers persistence). */
  onCommit: (offsetX: number, offsetY: number) => void;
}

export class DragController {
  private activePointerId: number | null = null;
  private startPointerX = 0;
  private startPointerY = 0;
  private startOffsetX = 0;
  private startOffsetY = 0;
  private latestOffsetX = 0;
  private latestOffsetY = 0;
  private rafHandle: number | null = null;

  private readonly onPointerDown = (event: PointerEvent): void => this.handlePointerDown(event);
  private readonly onPointerMove = (event: PointerEvent): void => this.handlePointerMove(event);
  private readonly onPointerUp = (event: PointerEvent): void => this.handlePointerUp(event);
  private readonly onPointerCancel = (event: PointerEvent): void => this.handlePointerUp(event);
  private readonly onLostCapture = (event: PointerEvent): void => this.handlePointerUp(event);

  constructor(
    private readonly element: HTMLElement,
    private readonly callbacks: DragCallbacks,
    /** Reads the current committed offset at gesture start. */
    private readonly getOffset: () => { offsetX: number; offsetY: number },
    /** Optional CSS selector for descendants that must not start a drag (e.g. resize handles). */
    private readonly ignoreSelector?: string,
  ) {}

  attach(): void {
    this.element.addEventListener('pointerdown', this.onPointerDown);
    this.element.addEventListener('pointermove', this.onPointerMove);
    this.element.addEventListener('pointerup', this.onPointerUp);
    this.element.addEventListener('pointercancel', this.onPointerCancel);
    // Capture can break mid-gesture (e.g. the overlay turns display:none); end the gesture then.
    this.element.addEventListener('lostpointercapture', this.onLostCapture);
  }

  detach(): void {
    this.cancelFrame();
    this.element.removeEventListener('pointerdown', this.onPointerDown);
    this.element.removeEventListener('pointermove', this.onPointerMove);
    this.element.removeEventListener('pointerup', this.onPointerUp);
    this.element.removeEventListener('pointercancel', this.onPointerCancel);
    this.element.removeEventListener('lostpointercapture', this.onLostCapture);
  }

  private handlePointerDown(event: PointerEvent): void {
    // Only primary button drags; ignore right/middle clicks.
    if (event.button !== 0) {
      return;
    }

    // Presses on opted-out descendants (resize handles) own their own gesture.
    if (this.ignoreSelector && (event.target as Element | null)?.closest(this.ignoreSelector)) {
      return;
    }

    this.activePointerId = event.pointerId;
    this.startPointerX = event.clientX;
    this.startPointerY = event.clientY;

    const { offsetX, offsetY } = this.getOffset();
    this.startOffsetX = offsetX;
    this.startOffsetY = offsetY;
    this.latestOffsetX = offsetX;
    this.latestOffsetY = offsetY;

    // Capture so subsequent move/up events target this element even if the pointer leaves it.
    // If capture is unavailable, the drag still works while the pointer stays over the element;
    // the gesture simply ends cleanly on pointerup rather than ghost-following (graceful degrade).
    try {
      this.element.setPointerCapture(event.pointerId);
    } catch {
      // setPointerCapture not supported / gesture interrupted — proceed without capture.
    }

    event.preventDefault();
  }

  private handlePointerMove(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) {
      return;
    }

    // An active gesture with no pressed buttons means the pointerup was never delivered (lost
    // capture): end it now, otherwise merely hovering would keep dragging the overlay.
    if (event.buttons === 0) {
      this.handlePointerUp(event);

      return;
    }

    this.latestOffsetX = this.startOffsetX + (event.clientX - this.startPointerX);
    this.latestOffsetY = this.startOffsetY + (event.clientY - this.startPointerY);

    this.scheduleFrame();
  }

  private handlePointerUp(event: PointerEvent): void {
    if (this.activePointerId !== event.pointerId) {
      return;
    }

    this.cancelFrame();

    try {
      this.element.releasePointerCapture(event.pointerId);
    } catch {
      // Already released or never captured — nothing to undo.
    }

    this.activePointerId = null;

    this.callbacks.onCommit(this.latestOffsetX, this.latestOffsetY);
  }

  private scheduleFrame(): void {
    if (this.rafHandle !== null) {
      return;
    }

    this.rafHandle = requestAnimationFrame(() => {
      this.rafHandle = null;
      this.callbacks.onPreview(this.latestOffsetX, this.latestOffsetY);
    });
  }

  private cancelFrame(): void {
    if (this.rafHandle !== null) {
      cancelAnimationFrame(this.rafHandle);
      this.rafHandle = null;
    }
  }
}
