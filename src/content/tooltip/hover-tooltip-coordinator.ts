// Hover tooltip coordinator: a single shared floating panel where every
// hover-based tool (typography, color picker, inspector dimensions, ...)
// contributes a "section". Without this coordinator each tool would draw its
// own tooltip, and when multiple tools are active simultaneously the tooltips
// stack on top of each other competing for the same space near the cursor.
//
// Lifecycle:
// - Tools call `registerSection(id, priority)` when they're enabled. They get
//   back a SectionHandle they keep for the lifetime of the activation.
// - On every hover update each tool calls `handle.update(payload)` and the
//   coordinator owner (any tool) calls `setTarget(element, rect)` so the panel
//   knows where to anchor and what selector to show in the header.
// - When the hover leaves a relevant element, tools call `handle.clear()`. When
//   the tool deactivates entirely it calls `handle.dispose()`.
//
// The coordinator is exposed as a process-wide singleton (mirrors the existing
// `getSelectionManager` / `getGuideManager` pattern in the codebase).

import { TOOLTIP_OFFSET_PX, VIEWPORT_MARGIN_PX, PIXLY_INTERACTIVE_ATTR } from '@/shared/constants/ui';
import { clientRectInsideViewport, copyTextToClipboard, describeElement } from '@/shared/utils/dom';
import { ensureShadowMount } from '../shadow-host';

// Section priority defines the vertical order inside the tooltip. Lower values
// render first. The header (element selector) is always at the top and is not
// a section.
export const TooltipSectionPriority = {
    Dimensions: 10,
    Color: 20,
    Typography: 30,
} as const;

export type TooltipSectionPriorityValue =
    (typeof TooltipSectionPriority)[keyof typeof TooltipSectionPriority];

export interface TooltipRow {
    label: string;
    value: string;
    // If present, the value renders as a clickable button that copies this text.
    // If omitted, the value renders as plain text (e.g., "612 × 56").
    copyValue?: string;
}

export interface TooltipSectionPayload {
    title: string;
    rows: TooltipRow[];
}

export interface TooltipSectionHandle {
    readonly id: string;
    update(payload: TooltipSectionPayload): void;
    clear(): void;
    dispose(): void;
}

export interface TooltipCopyNotifier {
    (message: string): void;
}

interface RegisteredSection {
    id: string;
    priority: number;
    payload: TooltipSectionPayload | null;
}

interface ComposedTooltipModel {
    headerText: string | null;
    sections: TooltipSectionPayload[];
}

const NO_PAYLOAD_SECTION_COUNT = 0;
const FIRST_SECTION_INDEX = 0;
const COPY_SUCCESS_TEMPLATE = 'Copied: ';
const COPY_FAILURE_MESSAGE = 'Unable to copy to clipboard.';

export class HoverTooltipCoordinator {
    private readonly sections = new Map<string, RegisteredSection>();
    private tooltipElement: HTMLDivElement | null = null;
    private target: Element | null = null;
    private anchorRect: DOMRect | null = null;
    private suppressed = false;
    private copyNotifier: TooltipCopyNotifier | null = null;

    registerSection(id: string, priority: number): TooltipSectionHandle {
        // Avoid silently overwriting an existing handle: dispose the previous
        // one first so a tool re-enabling itself starts from a clean state.
        if (this.sections.has(id)) {
            this.sections.delete(id);
        }

        const entry: RegisteredSection = { id, priority, payload: null };
        this.sections.set(id, entry);

        const handle: TooltipSectionHandle = {
            id,
            update: (payload) => {
                const stored = this.sections.get(id);

                if (!stored) {
                    return;
                }

                stored.payload = payload;
                this.render();
            },
            clear: () => {
                const stored = this.sections.get(id);

                if (!stored) {
                    return;
                }

                stored.payload = null;
                this.render();
            },
            dispose: () => {
                this.sections.delete(id);
                this.render();
            },
        };

        return handle;
    }

    setTarget(element: Element | null, anchorRect: DOMRect | null): void {
        this.target = element;
        this.anchorRect = anchorRect;
        this.render();
    }

    setSuppressed(suppressed: boolean): void {
        if (this.suppressed === suppressed) {
            return;
        }

        this.suppressed = suppressed;
        this.render();
    }

    setCopyNotifier(notifier: TooltipCopyNotifier | null): void {
        this.copyNotifier = notifier;
    }

    // Pure aggregation: given the registered sections and the current target,
    // produce the data model that will be rendered. Extracted as a method so
    // tests can verify the aggregation logic without touching the DOM.
    composeModel(): ComposedTooltipModel {
        const orderedSections = Array.from(this.sections.values())
            .filter((section) => section.payload !== null)
            .sort((a, b) => a.priority - b.priority)
            .map((section) => section.payload as TooltipSectionPayload);

        const headerText = this.target ? describeElement(this.target) : null;

        return { headerText, sections: orderedSections };
    }

    // ---------- Rendering ----------

    private render(): void {
        if (this.suppressed) {
            this.hide();

            return;
        }

        const model = this.composeModel();

        if (model.sections.length === NO_PAYLOAD_SECTION_COUNT || !this.target || !this.anchorRect) {
            this.hide();

            return;
        }

        const tooltip = this.ensureTooltipElement();
        tooltip.innerHTML = this.renderHtml(model);
        this.wireCopyButtons(tooltip);
        this.positionTooltip(tooltip, this.anchorRect);
        tooltip.style.display = 'block';
    }

    private ensureTooltipElement(): HTMLDivElement {
        if (this.tooltipElement && this.tooltipElement.isConnected) {
            return this.tooltipElement;
        }

        const { layer } = ensureShadowMount();
        const tooltip = document.createElement('div');
        tooltip.className = 'pixly-tooltip pixly-hover-tooltip';
        tooltip.setAttribute(PIXLY_INTERACTIVE_ATTR, 'true');
        layer.appendChild(tooltip);
        this.tooltipElement = tooltip;

        return tooltip;
    }

    private renderHtml(model: ComposedTooltipModel): string {
        const headerHtml = model.headerText
            ? `<div class="pixly-hover-tooltip-header">${this.escape(model.headerText)}</div>`
            : '';

        const sectionsHtml = model.sections
            .map((section, index) => this.renderSection(section, index === FIRST_SECTION_INDEX))
            .join('');

        return `${headerHtml}${sectionsHtml}`;
    }

    private renderSection(section: TooltipSectionPayload, isFirst: boolean): string {
        const dividerClass = isFirst ? '' : ' has-divider';
        const rowsHtml = section.rows.map((row) => this.renderRow(row)).join('');

        return `
            <div class="pixly-hover-tooltip-section${dividerClass}">
                <div class="pixly-hover-tooltip-section-title">${this.escape(section.title)}</div>
                ${rowsHtml}
            </div>
        `;
    }

    private renderRow(row: TooltipRow): string {
        const escapedLabel = this.escape(row.label);
        const escapedValue = this.escape(row.value);

        if (row.copyValue === undefined) {
            return `<div class="pixly-tooltip-row"><span>${escapedLabel}</span><span class="pixly-hover-tooltip-static">${escapedValue}</span></div>`;
        }

        const escapedCopy = this.escape(row.copyValue);

        return `<div class="pixly-tooltip-row"><span>${escapedLabel}</span><button data-copy="${escapedCopy}">${escapedValue}</button></div>`;
    }

    private wireCopyButtons(tooltip: HTMLDivElement): void {
        const buttons = tooltip.querySelectorAll<HTMLButtonElement>('button[data-copy]');

        for (const button of buttons) {
            button.onclick = async () => {
                const value = button.dataset.copy ?? '';
                const ok = await copyTextToClipboard(value);

                if (this.copyNotifier) {
                    this.copyNotifier(ok ? `${COPY_SUCCESS_TEMPLATE}${value}` : COPY_FAILURE_MESSAGE);
                }
            };
        }
    }

    private positionTooltip(tooltip: HTMLDivElement, anchorRect: DOMRect): void {
        const tooltipRect = tooltip.getBoundingClientRect();
        const desiredX = anchorRect.left;
        const desiredY = anchorRect.bottom + TOOLTIP_OFFSET_PX;
        const position = clientRectInsideViewport(
            { width: tooltipRect.width, height: tooltipRect.height },
            desiredX,
            desiredY,
            VIEWPORT_MARGIN_PX,
        );

        tooltip.style.left = `${position.x}px`;
        tooltip.style.top = `${position.y}px`;
    }

    private hide(): void {
        if (this.tooltipElement) {
            this.tooltipElement.style.display = 'none';
        }
    }

    private escape(value: string): string {
        return value.replace(/[&<>"']/g, (char) => {
            const escapes: Record<string, string> = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;',
            };

            return escapes[char] ?? char;
        });
    }

    // Exposed for tests so they can reset the singleton between runs.
    dispose(): void {
        this.sections.clear();
        this.tooltipElement?.remove();
        this.tooltipElement = null;
        this.target = null;
        this.anchorRect = null;
        this.suppressed = false;
        this.copyNotifier = null;
    }
}

let sharedCoordinator: HoverTooltipCoordinator | null = null;

export function getHoverTooltipCoordinator(): HoverTooltipCoordinator {
    if (!sharedCoordinator) {
        sharedCoordinator = new HoverTooltipCoordinator();
    }

    return sharedCoordinator;
}
