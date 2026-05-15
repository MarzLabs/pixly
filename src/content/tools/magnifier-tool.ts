// Magnifier: floating circular window that renders an enlarged copy of the
// area around the cursor. Uses background-image with computed positioning so
// it works without canvas capture (which would require browser permissions).

import { MAGNIFIER_DEFAULTS } from '@/shared/constants/ui';
import { clamp } from '@/shared/utils/measurements';
import { ensureShadowMount } from '../shadow-host';
import type { Tool, ToolContext } from './tool';

const CURSOR_OFFSET_PX = 24;

export class MagnifierTool implements Tool {
    private bubble: HTMLDivElement | null = null;
    private bubbleInner: HTMLDivElement | null = null;
    private readonly handleMove = this.onMouseMove.bind(this);
    private readonly handleWheel = this.onWheel.bind(this);
    private currentZoom: number = MAGNIFIER_DEFAULTS.zoomLevel;

    enable(context: ToolContext): void {
        this.currentZoom = context.settings.magnifier.zoomLevel;

        const { layer } = ensureShadowMount();
        this.bubble = document.createElement('div');
        this.bubble.className = 'pixly-magnifier';
        this.bubble.style.width = `${context.settings.magnifier.sizePx}px`;
        this.bubble.style.height = `${context.settings.magnifier.sizePx}px`;

        this.bubbleInner = document.createElement('div');
        this.bubbleInner.style.width = '100%';
        this.bubbleInner.style.height = '100%';
        this.bubbleInner.style.transformOrigin = '0 0';
        this.bubbleInner.style.position = 'relative';
        this.bubble.appendChild(this.bubbleInner);

        layer.appendChild(this.bubble);

        document.addEventListener('mousemove', this.handleMove, { passive: true });
        document.addEventListener('wheel', this.handleWheel, { passive: false });
    }

    disable(): void {
        document.removeEventListener('mousemove', this.handleMove);
        document.removeEventListener('wheel', this.handleWheel);
        this.bubble?.remove();
        this.bubble = null;
        this.bubbleInner = null;
    }

    private onMouseMove(event: MouseEvent): void {
        if (!this.bubble || !this.bubbleInner) {
            return;
        }

        const size = this.bubble.offsetWidth;
        const x = clamp(event.clientX + CURSOR_OFFSET_PX, 0, window.innerWidth - size);
        const y = clamp(event.clientY + CURSOR_OFFSET_PX, 0, window.innerHeight - size);

        this.bubble.style.left = `${x}px`;
        this.bubble.style.top = `${y}px`;

        // The magnifier uses a CSS transform on a clone of the page using
        // an SVG <foreignObject> approach would be expensive. Instead we use
        // background-image: -moz-element / -webkit-element which is not
        // universally supported. Fallback: show a tooltip noting which area
        // is magnified by overlaying a circle with a transform applied to a
        // shallow clone of nearby content. For visual feedback we apply CSS
        // zoom on a clone of the centered element.
        const centerElement = document.elementFromPoint(event.clientX, event.clientY);

        if (!centerElement || centerElement.id === 'pixly-shadow-host') {
            return;
        }

        // Render a snapshot using html2canvas-like approach is heavy; instead
        // we present a simple magnified clone of the element's bounding box.
        const rect = centerElement.getBoundingClientRect();
        this.bubbleInner.innerHTML = '';
        const clone = centerElement.cloneNode(true) as HTMLElement;
        clone.style.transform = `scale(${this.currentZoom})`;
        clone.style.transformOrigin = '0 0';
        clone.style.position = 'absolute';
        clone.style.left = `${-((event.clientX - rect.left) * this.currentZoom - size / 2)}px`;
        clone.style.top = `${-((event.clientY - rect.top) * this.currentZoom - size / 2)}px`;
        clone.style.pointerEvents = 'none';

        this.bubbleInner.appendChild(clone);
    }

    private onWheel(event: WheelEvent): void {
        if (!this.bubble) return;

        event.preventDefault();

        const ZOOM_STEP = 0.5;
        const delta = event.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
        this.currentZoom = clamp(this.currentZoom + delta, MAGNIFIER_DEFAULTS.minZoom, MAGNIFIER_DEFAULTS.maxZoom);
    }
}
