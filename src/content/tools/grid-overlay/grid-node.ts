import type { GridOverlayState } from '@shared/types';
import { buildBaselineGradient, buildFrameStyle } from './grid-geometry';

/**
 * Owns the grid's DOM inside the Shadow DOM (RF-CORE-2). All visual state is applied imperatively
 * — Preact is only used for the control panel. The node is document-anchored (absolute, top 0) so
 * the grid scrolls with the page like a real layout grid, and pointer-transparent so it never
 * blocks interaction.
 *
 * Structure: root (full document height) → frame (max-width + side margins, centered) →
 * columns (flex row, one div per column) + baseline (repeating-gradient layer).
 */
export class GridNode {
  private readonly root: HTMLDivElement;
  private readonly frame: HTMLDivElement;
  private readonly columnsContainer: HTMLDivElement;
  private readonly baselineLayer: HTMLDivElement;
  private readonly resizeObserver: ResizeObserver;
  private readonly onWindowResize = (): void => this.syncSize();

  constructor(parent: HTMLElement, initialState: GridOverlayState) {
    this.root = document.createElement('div');
    this.root.className = 'pixly-grid';

    this.frame = document.createElement('div');
    this.frame.className = 'pixly-grid__frame';
    this.root.appendChild(this.frame);

    this.columnsContainer = document.createElement('div');
    this.columnsContainer.className = 'pixly-grid__columns';
    this.frame.appendChild(this.columnsContainer);

    this.baselineLayer = document.createElement('div');
    this.baselineLayer.className = 'pixly-grid__baseline';
    this.frame.appendChild(this.baselineLayer);

    parent.appendChild(this.root);

    // Keep the grid as tall as the document even when content loads lazily below the fold.
    this.resizeObserver = new ResizeObserver(() => this.syncSize());
    this.resizeObserver.observe(document.documentElement);
    window.addEventListener('resize', this.onWindowResize);

    this.update(initialState);
    this.syncSize();
  }

  /** Applies the full state; cheap enough to run on every control change. */
  update(state: GridOverlayState): void {
    this.root.style.opacity = String(state.opacity);
    this.root.style.color = state.color;
    this.root.classList.toggle('pixly-grid--hidden', state.hidden);

    const frameStyle = buildFrameStyle(state);
    this.frame.style.maxWidth = frameStyle.maxWidth;
    this.frame.style.paddingLeft = frameStyle.paddingLeft;
    this.frame.style.paddingRight = frameStyle.paddingRight;

    this.columnsContainer.style.gap = `${state.gutterPx}px`;
    this.syncColumnCount(state.columns);

    this.baselineLayer.style.display = state.showBaseline ? 'block' : 'none';
    this.baselineLayer.style.backgroundImage = buildBaselineGradient(state.baselinePx);
  }

  destroy(): void {
    this.resizeObserver.disconnect();
    window.removeEventListener('resize', this.onWindowResize);
    this.root.remove();
  }

  private syncColumnCount(columns: number): void {
    while (this.columnsContainer.children.length > columns) {
      this.columnsContainer.lastElementChild?.remove();
    }

    while (this.columnsContainer.children.length < columns) {
      const column = document.createElement('div');
      column.className = 'pixly-grid__column';
      this.columnsContainer.appendChild(column);
    }
  }

  /**
   * Both dimensions must be explicit pixels: the shadow host is a deliberate 0×0 box (so it never
   * affects page layout), which makes it a zero-sized containing block — any percentage width on
   * an absolutely-positioned child resolves to 0 and the grid would be invisible.
   */
  private syncSize(): void {
    this.root.style.width = `${document.documentElement.clientWidth}px`;
    this.root.style.height = `${document.documentElement.scrollHeight}px`;
  }
}
