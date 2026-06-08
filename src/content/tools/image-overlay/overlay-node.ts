import type { OverlayState } from '@shared/types';
import { DragController } from './drag-controller';
import { ResizeController } from './resize-controller';
import type { OverlayTransform } from './overlay-geometry';
import {
  applyNudge,
  arrowKeyToDirection,
  buildTransform,
  renderedSize,
  RESIZE_CORNERS,
} from './overlay-geometry';

/**
 * Owns the actual overlay DOM node inside the Shadow DOM (spec §7.4). All visual state is applied
 * imperatively here — Preact is never used for the overlay element, only for the control panel — so
 * the drag/resize stay direct Pointer Events interactions (RF-OVL-1).
 *
 * The overlay is sized in pixels (natural size × scale) rather than via a CSS `scale()` transform, so
 * the corner resize handles keep a constant on-screen size at any scale factor.
 */

const HANDLE_BASE_CLASS = 'pixly-overlay__handle';
const HANDLE_SELECTOR = `.${HANDLE_BASE_CLASS}`;

export interface OverlayNodeCallbacks {
  /** Called when a move interaction commits a new offset (drag end / keyboard nudge) → persist. */
  onOffsetCommit: (offsetX: number, offsetY: number) => void;
  /** Called when a corner-resize gesture commits a new scale and offset → persist + refresh UI. */
  onResizeCommit: (scale: number, offsetX: number, offsetY: number) => void;
}

export class OverlayNode {
  private readonly root: HTMLDivElement;
  private readonly image: HTMLImageElement;
  private readonly drag: DragController;
  private readonly resize: ResizeController;
  private readonly callbacks: OverlayNodeCallbacks;
  private state: OverlayState;
  private naturalWidth = 0;
  private naturalHeight = 0;
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
    this.image.onload = (): void => this.handleImageLoad();
    this.root.appendChild(this.image);

    parent.appendChild(this.root);

    this.drag = new DragController(
      this.root,
      {
        onPreview: (x, y) => this.previewPosition(x, y),
        onCommit: (x, y) => {
          this.state = { ...this.state, offsetX: x, offsetY: y };
          this.applyGeometry();
          this.callbacks.onOffsetCommit(x, y);
        },
      },
      () => ({ offsetX: this.state.offsetX, offsetY: this.state.offsetY }),
      // A press on a resize handle must not also start a move drag of the whole overlay.
      HANDLE_SELECTOR,
    );

    this.resize = new ResizeController(
      {
        onPreview: (transform) => this.previewGeometry(transform),
        onCommit: (transform) => {
          this.state = {
            ...this.state,
            scale: transform.scale,
            offsetX: transform.offsetX,
            offsetY: transform.offsetY,
          };
          this.applyGeometry();
          this.callbacks.onResizeCommit(transform.scale, transform.offsetX, transform.offsetY);
        },
      },
      () => ({ offsetX: this.state.offsetX, offsetY: this.state.offsetY, scale: this.state.scale }),
      () => ({ width: this.naturalWidth, height: this.naturalHeight }),
    );

    this.createHandles();
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

  /** Natural pixel size of the loaded image, or null while no image has loaded yet. */
  getNaturalSize(): { width: number; height: number } | null {
    if (this.naturalWidth === 0 || this.naturalHeight === 0) {
      return null;
    }

    return { width: this.naturalWidth, height: this.naturalHeight };
  }

  destroy(): void {
    this.drag.detach();
    this.resize.detach();
    this.root.removeEventListener('keydown', this.onKeyDown);

    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    this.root.remove();
  }

  private createHandles(): void {
    for (const corner of RESIZE_CORNERS) {
      const handle = document.createElement('div');
      handle.className = `${HANDLE_BASE_CLASS} ${HANDLE_BASE_CLASS}--${corner}`;
      this.root.appendChild(handle);
      this.resize.addHandle(handle, corner);
    }
  }

  private handleImageLoad(): void {
    this.naturalWidth = this.image.naturalWidth;
    this.naturalHeight = this.image.naturalHeight;
    this.applyGeometry();
  }

  private render(): void {
    this.applyGeometry();

    this.image.style.opacity = String(this.state.opacity);
    this.image.style.mixBlendMode = this.state.blendMode;

    this.root.classList.toggle('pixly-overlay--locked', this.state.locked);
    this.root.classList.toggle('pixly-overlay--hidden', this.state.hidden);
  }

  /** Applies both position and size from the committed state. */
  private applyGeometry(): void {
    this.root.style.transform = buildTransform(this.state.offsetX, this.state.offsetY);
    this.applySize(this.state.scale);
  }

  /** Live position-only update during a move drag (size is unchanged, so it is left alone). */
  private previewPosition(offsetX: number, offsetY: number): void {
    this.root.style.transform = buildTransform(offsetX, offsetY);
  }

  /** Live position + size update during a resize gesture. */
  private previewGeometry(transform: OverlayTransform): void {
    this.root.style.transform = buildTransform(transform.offsetX, transform.offsetY);
    this.applySize(transform.scale);
  }

  private applySize(scale: number): void {
    if (this.naturalWidth === 0 || this.naturalHeight === 0) {
      return;
    }

    const { width, height } = renderedSize(this.naturalWidth, this.naturalHeight, scale);
    this.root.style.width = `${width}px`;
    this.root.style.height = `${height}px`;
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
    this.previewPosition(next.offsetX, next.offsetY);
    this.callbacks.onOffsetCommit(next.offsetX, next.offsetY);
  }
}
