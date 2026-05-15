// Snapshot tool: requests a screenshot via the service worker (which has
// access to chrome.tabs.captureVisibleTab) and renders a side-by-side view
// against the loaded overlay image.

import { ensureShadowMount } from '../shadow-host';
import type { Tool, ToolContext } from '../tools/tool';

export class SnapshotTool implements Tool {
    private container: HTMLDivElement | null = null;

    enable(_context: ToolContext): void {
        ensureShadowMount();
    }

    disable(): void {
        this.close();
    }

    showSideBySide(snapshotDataUrl: string, overlayDataUrl: string): void {
        this.close();

        const { layer } = ensureShadowMount();
        layer.classList.add('interactive');

        this.container = document.createElement('div');
        this.container.className = 'pixly-side-by-side';
        this.container.innerHTML = `
            <div class="pixly-side-by-side-toolbar">
                <strong>Side-by-side comparison</strong>
                <div>
                    <button type="button" data-action="close">Close</button>
                </div>
            </div>
            <div class="pixly-side-by-side-content">
                <div class="pixly-side-by-side-panel"><img alt="Page snapshot" /></div>
                <div class="pixly-side-by-side-panel"><img alt="Reference design" /></div>
            </div>
        `;

        const images = this.container.querySelectorAll<HTMLImageElement>('img');
        images[0].src = snapshotDataUrl;
        images[1].src = overlayDataUrl;

        this.container.querySelector<HTMLButtonElement>('[data-action="close"]')!.addEventListener('click', () => this.close());

        // Sync scroll between the two panels for parallel review.
        const panels = this.container.querySelectorAll<HTMLDivElement>('.pixly-side-by-side-panel');
        let syncing = false;

        panels.forEach((panel, index) => {
            panel.addEventListener('scroll', () => {
                if (syncing) return;
                syncing = true;
                const other = panels[(index + 1) % panels.length];
                other.scrollTop = panel.scrollTop;
                other.scrollLeft = panel.scrollLeft;
                requestAnimationFrame(() => { syncing = false; });
            });
        });

        layer.appendChild(this.container);
    }

    close(): void {
        this.container?.remove();
        this.container = null;
    }

    onEscape(): void {
        this.close();
    }
}
