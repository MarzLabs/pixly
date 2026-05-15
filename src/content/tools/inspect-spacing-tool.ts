// Inspect spacing: hovers an element and overlays its padding (green) and
// margin (orange) as Figma-style boxes.

import { SPACING_MARGIN_COLOR, SPACING_PADDING_COLOR } from '@/shared/constants/ui';
import { elementUnderPoint } from '@/shared/utils/dom';
import { ensureShadowMount } from '../shadow-host';
import type { Tool, ToolContext } from './tool';

const HOVER_THROTTLE_MS = 32;

interface SpacingBox {
    top: HTMLDivElement;
    right: HTMLDivElement;
    bottom: HTMLDivElement;
    left: HTMLDivElement;
}

function createBoxQuartet(className: string, layer: HTMLDivElement): SpacingBox {
    const create = (): HTMLDivElement => {
        const div = document.createElement('div');
        div.className = className;
        layer.appendChild(div);

        return div;
    };

    return { top: create(), right: create(), bottom: create(), left: create() };
}

export class InspectSpacingTool implements Tool {
    private padding: SpacingBox | null = null;
    private margin: SpacingBox | null = null;
    private lastUpdate = 0;
    private readonly handleMove = this.onMouseMove.bind(this);

    enable(_context: ToolContext): void {
        const { layer } = ensureShadowMount();
        this.padding = createBoxQuartet('pixly-spacing-padding', layer);
        this.margin = createBoxQuartet('pixly-spacing-margin', layer);

        // Distinguish padding vs margin via inline color override.
        for (const side of Object.values(this.padding)) {
            side.style.background = SPACING_PADDING_COLOR;
        }

        for (const side of Object.values(this.margin)) {
            side.style.background = SPACING_MARGIN_COLOR;
        }

        document.addEventListener('mousemove', this.handleMove, { passive: true });
    }

    disable(): void {
        document.removeEventListener('mousemove', this.handleMove);

        if (this.padding) {
            for (const side of Object.values(this.padding)) {
                side.remove();
            }
        }

        if (this.margin) {
            for (const side of Object.values(this.margin)) {
                side.remove();
            }
        }

        this.padding = null;
        this.margin = null;
    }

    private onMouseMove(event: MouseEvent): void {
        const now = performance.now();

        if (now - this.lastUpdate < HOVER_THROTTLE_MS) {
            return;
        }

        this.lastUpdate = now;

        const element = elementUnderPoint(event.clientX, event.clientY);

        if (!element || !this.padding || !this.margin) {
            this.hide();

            return;
        }

        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const paddingTop = parseFloat(style.paddingTop);
        const paddingRight = parseFloat(style.paddingRight);
        const paddingBottom = parseFloat(style.paddingBottom);
        const paddingLeft = parseFloat(style.paddingLeft);
        const marginTop = parseFloat(style.marginTop);
        const marginRight = parseFloat(style.marginRight);
        const marginBottom = parseFloat(style.marginBottom);
        const marginLeft = parseFloat(style.marginLeft);

        this.positionBox(this.padding.top, rect.left, rect.top, rect.width, paddingTop);
        this.positionBox(this.padding.bottom, rect.left, rect.bottom - paddingBottom, rect.width, paddingBottom);
        this.positionBox(this.padding.left, rect.left, rect.top, paddingLeft, rect.height);
        this.positionBox(this.padding.right, rect.right - paddingRight, rect.top, paddingRight, rect.height);

        this.positionBox(this.margin.top, rect.left - marginLeft, rect.top - marginTop, rect.width + marginLeft + marginRight, marginTop);
        this.positionBox(this.margin.bottom, rect.left - marginLeft, rect.bottom, rect.width + marginLeft + marginRight, marginBottom);
        this.positionBox(this.margin.left, rect.left - marginLeft, rect.top, marginLeft, rect.height);
        this.positionBox(this.margin.right, rect.right, rect.top, marginRight, rect.height);
    }

    private positionBox(box: HTMLDivElement, x: number, y: number, width: number, height: number): void {
        box.style.left = `${x}px`;
        box.style.top = `${y}px`;
        box.style.width = `${Math.max(0, width)}px`;
        box.style.height = `${Math.max(0, height)}px`;
        box.style.display = width > 0 && height > 0 ? 'block' : 'none';
    }

    private hide(): void {
        const all = [
            ...(this.padding ? Object.values(this.padding) : []),
            ...(this.margin ? Object.values(this.margin) : []),
        ];

        for (const side of all) {
            side.style.display = 'none';
        }
    }
}
