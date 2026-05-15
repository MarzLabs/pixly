// Color picker: hover an element to show its background color in hex and rgb;
// click on a value to copy to clipboard. Renders into the shared
// HoverTooltipCoordinator so it composes with other hover tools instead of
// drawing its own floating tooltip.

import { elementUnderPoint } from '@/shared/utils/dom';
import { cssColorToHex, cssColorToRgbString } from '@/shared/utils/colors';
import {
    getHoverTooltipCoordinator,
    TooltipSectionPriority,
    type TooltipSectionHandle,
} from '../tooltip/hover-tooltip-coordinator';
import type { Tool, ToolContext } from './tool';

const HOVER_THROTTLE_MS = 32;
const SECTION_ID = 'color';
const SECTION_TITLE = 'Color de fondo';
const COLOR_FALLBACK = '—';

export class ColorPickerTool implements Tool {
    private sectionHandle: TooltipSectionHandle | null = null;
    private lastUpdate = 0;
    private readonly handleMove = this.onMouseMove.bind(this);

    enable(context: ToolContext): void {
        const coordinator = getHoverTooltipCoordinator();

        coordinator.setCopyNotifier((message) => context.showNotification(message));
        this.sectionHandle = coordinator.registerSection(SECTION_ID, TooltipSectionPriority.Color);

        document.addEventListener('mousemove', this.handleMove, { passive: true });
    }

    disable(): void {
        document.removeEventListener('mousemove', this.handleMove);
        this.sectionHandle?.dispose();
        this.sectionHandle = null;
    }

    private onMouseMove(event: MouseEvent): void {
        const now = performance.now();

        if (now - this.lastUpdate < HOVER_THROTTLE_MS) {
            return;
        }

        this.lastUpdate = now;

        const element = elementUnderPoint(event.clientX, event.clientY);

        if (!element || !this.sectionHandle) {
            this.sectionHandle?.clear();

            return;
        }

        const style = getComputedStyle(element);
        const hex = cssColorToHex(style.backgroundColor) ?? COLOR_FALLBACK;
        const rgb = cssColorToRgbString(style.backgroundColor) ?? style.backgroundColor;

        this.sectionHandle.update({
            title: SECTION_TITLE,
            rows: [
                { label: 'hex', value: hex, copyValue: hex },
                { label: 'rgb', value: rgb, copyValue: rgb },
            ],
        });

        const rect = element.getBoundingClientRect();
        getHoverTooltipCoordinator().setTarget(element, rect);
    }
}
