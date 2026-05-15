// Typography inspector: hover any text element to read its typography
// properties. Renders its data inside the shared HoverTooltipCoordinator so it
// stacks with other hover tools (color picker, inspector dimensions) instead
// of drawing an independent floating tooltip.

import { elementUnderPoint } from '@/shared/utils/dom';
import { cssColorToHex, cssColorToRgbString } from '@/shared/utils/colors';
import {
    getHoverTooltipCoordinator,
    TooltipSectionPriority,
    type TooltipSectionHandle,
} from '../tooltip/hover-tooltip-coordinator';
import type { Tool, ToolContext } from './tool';

const HOVER_THROTTLE_MS = 32;
const SECTION_ID = 'typography';
const SECTION_TITLE = 'Typography';
const COLOR_FALLBACK = '—';

export class TypographyTool implements Tool {
    private sectionHandle: TooltipSectionHandle | null = null;
    private lastUpdate = 0;
    private readonly handleMove = this.onMouseMove.bind(this);

    enable(context: ToolContext): void {
        const coordinator = getHoverTooltipCoordinator();

        coordinator.setCopyNotifier((message) => context.showNotification(message));
        this.sectionHandle = coordinator.registerSection(SECTION_ID, TooltipSectionPriority.Typography);

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

        if (!this.hasReadableText(element)) {
            this.sectionHandle.clear();

            return;
        }

        const style = getComputedStyle(element);
        const colorHex = cssColorToHex(style.color) ?? COLOR_FALLBACK;
        const colorRgb = cssColorToRgbString(style.color) ?? style.color;

        this.sectionHandle.update({
            title: SECTION_TITLE,
            rows: [
                { label: 'font-family', value: style.fontFamily, copyValue: style.fontFamily },
                { label: 'font-size', value: style.fontSize, copyValue: style.fontSize },
                { label: 'line-height', value: style.lineHeight, copyValue: style.lineHeight },
                { label: 'letter-spacing', value: style.letterSpacing, copyValue: style.letterSpacing },
                { label: 'font-weight', value: style.fontWeight, copyValue: style.fontWeight },
                { label: 'color hex', value: colorHex, copyValue: colorHex },
                { label: 'color rgb', value: colorRgb, copyValue: colorRgb },
            ],
        });

        const rect = element.getBoundingClientRect();
        getHoverTooltipCoordinator().setTarget(element, rect);
    }

    private hasReadableText(element: Element): boolean {
        const text = element.textContent?.trim() ?? '';

        return text.length > 0;
    }
}
