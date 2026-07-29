import { render, h } from 'preact';
import type { ToolbarUiState } from '@shared/types';
import type { Tool } from '@content/core/tool';
import { Toolbar } from './Toolbar';

/**
 * Mounts/refreshes the Preact toolbar widget inside the Shadow DOM. The widget only appears while
 * at least one active tool exposes LIVE controls (RF-UI-3); set-and-forget tools are configured
 * from the popup instead, so they never summon the on-page widget.
 */
export class ToolbarMount {
  private container: HTMLDivElement | null = null;
  private refreshNonce = 0;

  constructor(
    private readonly layer: HTMLElement,
    private readonly onUiStateChange: (state: ToolbarUiState) => void,
  ) {}

  /** Renders the widget for the given active tools, or removes it when none have live controls. */
  sync(activeTools: Tool[], uiState: ToolbarUiState): void {
    const toolsWithControls = activeTools.filter((tool) => tool.renderControls);

    if (toolsWithControls.length === 0) {
      this.unmount();

      return;
    }

    if (!this.container) {
      this.container = document.createElement('div');
      this.layer.appendChild(this.container);
    }

    render(
      h(Toolbar, {
        activeTools: toolsWithControls,
        refreshNonce: this.refreshNonce,
        uiState,
        onUiStateChange: this.onUiStateChange,
      }),
      this.container,
    );
  }

  /** Forces the live controls to re-render (e.g. after a tool mutates its own state). */
  refresh(activeTools: Tool[], uiState: ToolbarUiState): void {
    this.refreshNonce += 1;
    this.sync(activeTools, uiState);
  }

  private unmount(): void {
    if (this.container) {
      render(null, this.container);
      this.container.remove();
      this.container = null;
    }
  }
}
