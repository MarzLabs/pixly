// Grid overlay: renders configurable columns centered on the viewport.

import type { GridSettings } from '@/shared/types/settings';
import { ensureShadowMount } from '../shadow-host';
import type { Tool, ToolContext } from './tool';

export class GridOverlayTool implements Tool {
    private container: HTMLDivElement | null = null;
    private inner: HTMLDivElement | null = null;
    private unsubscribeSettings: (() => void) | null = null;

    enable(context: ToolContext): void {
        const { layer } = ensureShadowMount();

        this.container = document.createElement('div');
        this.container.className = 'pixly-grid-overlay';

        this.inner = document.createElement('div');
        this.inner.className = 'pixly-grid-container';
        this.container.appendChild(this.inner);

        layer.appendChild(this.container);

        this.render(context.settings.grid);

        this.unsubscribeSettings = context.onSettingsChange((settings) => {
            this.render(settings.grid);
        });
    }

    disable(): void {
        this.container?.remove();
        this.container = null;
        this.inner = null;
        this.unsubscribeSettings?.();
        this.unsubscribeSettings = null;
    }

    private render(grid: GridSettings): void {
        if (!this.inner) {
            return;
        }

        this.inner.innerHTML = '';
        this.inner.style.width = `${grid.maxWidthPx}px`;
        this.inner.style.gap = `${grid.gutterPx}px`;

        for (let i = 0; i < grid.columns; i++) {
            const column = document.createElement('div');
            column.className = 'pixly-grid-column';
            column.style.background = grid.color;
            column.style.opacity = String(grid.opacity);
            this.inner.appendChild(column);
        }
    }
}
