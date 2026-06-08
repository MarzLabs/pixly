import type { OverlayState } from '@shared/types';
import { DragController } from './drag-controller';
import { arrowKeyToDirection, applyNudge, buildTransform } from './overlay-geometry';

/**
 * Owns the actual overlay DOM node inside the Shadow DOM (spec §7.4). All visual state is applied
 * imperatively here — Preact is never used for the overlay element, only for the control panel — so
 * the drag stays a direct Pointer Events interaction (RF-OVL-1).
 */

export interface OverlayNodeCallbacks {
  /** Called when an interaction commits a new offset (drag end / keyboard nudge) → persist. */
  onOffsetCommit: (offsetX: number, offsetY: number) => void;
}

export class OverlayNode {
  private readonly root: HTMLDivElement;
  private readonly image: HTMLImageElement;
  private readonly drag: DragController;
  private readonly callbacks: OverlayNodeCallbacks;
  private state: OverlayState;
  private objectUrl: string | null = null;
  private readonly onKeyDown = (event: KeyboardEvent): void => this.handleKeyDown(event);

  constructor(parent: HTMLElement, initialState: OverlayState, callbacks: OverlayNodeCallbacks) {
    this.state = initialState;
    this.callbacks = callbacks;

    this.root = document.createElement('div');
    this.root.className = 'pixly-overlay';
    this.root.tabIndex = 0;

    this.image = document.createElement('img');
    this.image.alt = '';
    this.image.draggable = false;
    this.root.appendChild(this.image);

    parent.appendChild(this.root);

    this.drag = new DragController(
      this.root,
      {
        onPreview: (x, y) => this.applyTransform(x, y, this.state.scale),
        onCommit: (x, y) => {
          this.state = { ...this.state, offsetX: x, offsetY: y };
          this.applyTransform(x, y, this.state.scale);
          this.callbacks.onOffsetCommit(x, y);
        },
      },
      () => ({ offsetX: this.state.offsetX, offsetY: this.state.offsetY }),
    );

    this.drag.attach();
    this.root.addEventListener('keydown', this.onKeyDown);

    this.render();
  }

  /** Points the overlay at a fresh object URL for the given blob, revoking any previous one. */
  setImageBlob(blob: Blob): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }

    this.objectUrl = URL.createObjectURL(blob);
    this.image.src = this.objectUrl;
  }

  /** Replaces the full state and re-renders (used on external updates from the control panel). */
  update(state: OverlayState): void {
    this.state = state;
    this.render();
  }

  getState(): OverlayState {
    return { ...this.state };
  }

  destroy(): void {
    this.drag.detach();
    this.root.removeEventListener('keydown', this.onKeyDown);

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    this.root.remove();
  }

  private render(): void {
    this.applyTransform(this.state.offsetX, this.state.offsetY, this.state.scale);

    this.image.style.opacity = String(this.state.opacity);
    this.image.style.mixBlendMode = this.state.blendMode;

    this.root.classList.toggle('pixly-overlay--locked', this.state.locked);
    this.root.classList.toggle('pixly-overlay--hidden', this.state.hidden);
  }

  private applyTransform(offsetX: number, offsetY: number, scale: number): void {
    this.root.style.transform = buildTransform(offsetX, offsetY, scale);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    const direction = arrowKeyToDirection(event.key);

    if (!direction || this.state.locked) {
      return;
    }

    // Arrow keys move the overlay; Shift switches to the coarse step (spec §7.3).
    event.preventDefault();

    const next = applyNudge(this.state.offsetX, this.state.offsetY, direction, event.shiftKey);

    this.state = { ...this.state, offsetX: next.offsetX, offsetY: next.offsetY };
    this.applyTransform(next.offsetX, next.offsetY, this.state.scale);
    this.callbacks.onOffsetCommit(next.offsetX, next.offsetY);
  }
}
