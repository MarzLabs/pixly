import { render, h } from 'preact';
import type { Tool } from '@content/core/tool';
import { Toolbar } from './Toolbar';

/**
 * Mounts/refreshes the Preact toolbar inside the Shadow DOM. The toolbar only appears while at
 * least one tool is active (RF-UI-3); when none are active it unmounts entirely.
 */
export class ToolbarMount {
  private container: HTMLDivElement | null = null;
  private refreshNonce = 0;

  constructor(private readonly layer: HTMLElement) {}

  /** Renders the toolbar for the given active tools, or removes it when the list is empty. */
  sync(activeTools: Tool[]): void {
    if (activeTools.length === 0) {
      this.unmount();

      return;
    }

    if (!this.container) {
      this.container = document.createElement('div');
      this.layer.appendChild(this.container);
    }

    render(
      h(Toolbar, { activeTools, refreshNonce: this.refreshNonce }),
      this.container,
    );
  }

  /** Forces the live controls to re-render (e.g. after a tool mutates its own state). */
  refresh(activeTools: Tool[]): void {
    this.refreshNonce += 1;
    this.sync(activeTools);
  }

  private unmount(): void {
    if (this.container) {
      render(null, this.container);
      this.container.remove();
      this.container = null;
    }
  }
}
