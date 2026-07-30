import type { SnapshotState } from '@shared/types';

/**
 * Owns the snapshot comparison layer inside the Shadow DOM (RF-CORE-2), all imperative. The layer
 * is document-anchored at the scroll position where the capture was taken, so scrolling back to
 * that spot aligns the snapshot with what it photographed. Pointer-transparent: it is a reference
 * image, never an interaction target.
 *
 * The blend mode lives on the root (not the img) for the same reason as the image overlay:
 * mix-blend-mode only composites against the backdrop of its parent stacking context.
 */
export class SnapshotNode {
  private readonly root: HTMLDivElement;
  private readonly image: HTMLImageElement;
  private objectUrl: string | null = null;

  constructor(parent: HTMLElement, initialState: SnapshotState) {
    this.root = document.createElement('div');
    this.root.className = 'pixly-snapshot';

    this.image = document.createElement('img');
    this.image.alt = '';
    this.image.draggable = false;
    this.root.appendChild(this.image);

    parent.appendChild(this.root);
    this.update(initialState);
  }

  /** Points the layer at a fresh object URL for the given blob, revoking any previous one. */
  setImageBlob(blob: Blob): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }

    this.objectUrl = URL.createObjectURL(blob);
    this.image.src = this.objectUrl;
  }

  /** Clears the displayed capture (e.g. after Remove). */
  clearImage(): void {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }

    this.image.removeAttribute('src');
  }

  /** Applies the full state; cheap enough to run on every control change. */
  update(state: SnapshotState): void {
    const hasCapture = state.imageKey !== null;

    this.root.classList.toggle('pixly-snapshot--hidden', state.hidden || !hasCapture);
    this.root.style.transform = `translate(${state.offsetX}px, ${state.offsetY}px)`;
    this.root.style.width = `${state.widthPx}px`;
    this.root.style.height = `${state.heightPx}px`;
    this.root.style.opacity = String(state.opacity);
    this.root.style.mixBlendMode = state.blendMode;
  }

  destroy(): void {
    this.clearImage();
    this.root.remove();
  }
}
