// Lets the user paint background or outline colors on the element under the
// cursor. Active when the inspector is on; uses the palette color picked in
// the popup.

import { OUTLINE_THICKNESS_PX } from '@/shared/constants/ui';
import { elementUnderPoint } from '@/shared/utils/dom';
import type { Tool, ToolContext } from './tool';
import { applyBackgroundColor, applyOutline } from './applied-styles';

const OUTLINE_KEY = 'KeyB';

export class ColorApplierTool implements Tool {
    private context: ToolContext | null = null;
    private readonly handleClick = this.onClick.bind(this);
    private readonly handleKeyDown = this.onKeyDown.bind(this);

    enable(context: ToolContext): void {
        this.context = context;
        document.addEventListener('click', this.handleClick, true);
        document.addEventListener('keydown', this.handleKeyDown, true);
    }

    disable(): void {
        document.removeEventListener('click', this.handleClick, true);
        document.removeEventListener('keydown', this.handleKeyDown, true);
        this.context = null;
    }

    private onClick(event: MouseEvent): void {
        if (!event.shiftKey) {
            return;
        }

        const target = elementUnderPoint(event.clientX, event.clientY);

        if (!(target instanceof HTMLElement)) {
            this.context?.showNotification('Hover over an element before applying the color.');

            return;
        }

        const color = this.context?.settings.selectedPaletteColor;

        if (!color) {
            this.context?.showNotification('Select a color from the popup palette before applying it.');

            return;
        }

        event.preventDefault();
        event.stopPropagation();

        applyBackgroundColor(target, color);
    }

    private onKeyDown(event: KeyboardEvent): void {
        // Ctrl+Shift+B: apply outline to the hovered element.
        if (event.ctrlKey && event.shiftKey && event.code === OUTLINE_KEY) {
            const x = lastPointer.x;
            const y = lastPointer.y;
            const target = elementUnderPoint(x, y);

            if (!(target instanceof HTMLElement)) {
                this.context?.showNotification('Hover over an element before applying the outline.');

                return;
            }

            const color = this.context?.settings.selectedPaletteColor;

            if (!color) {
                this.context?.showNotification('Select a color from the popup palette before applying it.');

                return;
            }

            event.preventDefault();
            applyOutline(target, color, OUTLINE_THICKNESS_PX);
        }
    }
}

const lastPointer = { x: 0, y: 0 };

document.addEventListener('mousemove', (event) => {
    lastPointer.x = event.clientX;
    lastPointer.y = event.clientY;
}, { passive: true });
