// Inspector v2: hover an element for live measurements + the v1 behaviour, and
// support Shift+click multi-selection (with Ctrl/Cmd+click to remove a single
// element from the set). Multi-selection state lives in the shared
// SelectionManager so the inspector panel can react to it.
//
// As of v0.2.1 the floating tooltip is delegated to the shared
// HoverTooltipCoordinator. This tool still owns the highlight box and the
// adjacent-edge distance labels, but its dimensions data is now a section in
// the unified tooltip so other hover tools (typography, color picker) can
// merge their data into the same panel instead of stacking their own.

import { TOOLTIP_OFFSET_PX } from '@/shared/constants/ui';
import { elementUnderPoint, isElementVisible, isInsidePixlyUi, isInsidePixlyInteractivePanel } from '@/shared/utils/dom';
import { pxToUnit } from '@/shared/utils/measurements';
import { getSelectionManager } from '../selection/selection-manager';
import { ensureShadowMount } from '../shadow-host';
import {
    getHoverTooltipCoordinator,
    TooltipSectionPriority,
    type TooltipSectionHandle,
} from '../tooltip/hover-tooltip-coordinator';
import type { Tool, ToolContext } from './tool';

const MOUSE_THROTTLE_MS = 16;
const NO_SIBLING_DISTANCE = 0;
const PARENT_CHILD_WARNING_MS = 2500;
const LIMIT_REACHED_PREFIX = 'Multi-selection limit reached. Remove an element before adding another.';
const DIMENSIONS_SECTION_ID = 'dimensions';
const DIMENSIONS_SECTION_TITLE = 'Dimensions';
const DIMENSIONS_ROW_LABEL = 'width × height';
const MULTI_SELECTION_ROW_LABEL = 'multi-selection';
const SINGLE_ITEM_COUNT = 1;
const INSPECTOR_PANEL_SELECTOR = '.pixly-inspector-panel';
const SHADOW_HOST_QUERY_SELECTOR = '[data-pixly]';

// Suppresses the unified floating tooltip when the inspector panel is open
// and the user has opted to hide it. Centralised here because the inspector
// owns this preference (it's stored under `settings.inspectorPanel`).
export function shouldSuppressHoverTooltip(hideFloatingTooltip: boolean): boolean {
    if (!hideFloatingTooltip) {
        return false;
    }

    const panel = document.querySelector(SHADOW_HOST_QUERY_SELECTOR)?.shadowRoot?.querySelector(INSPECTOR_PANEL_SELECTOR);

    return Boolean(panel);
}

export class InspectorTool implements Tool {
    private context: ToolContext | null = null;
    private highlight: HTMLDivElement | null = null;
    private dimensionsSectionHandle: TooltipSectionHandle | null = null;
    private distanceLabels: HTMLDivElement[] = [];
    private currentElement: Element | null = null;
    private lastUpdate = 0;
    private unsubscribeSettings: (() => void) | null = null;
    private lastParentChildWarningAt = 0;
    private readonly handleMove = this.onMouseMove.bind(this);
    private readonly handleScroll = this.refreshAll.bind(this);
    private readonly handleClick = this.onClick.bind(this);

    enable(context: ToolContext): void {
        this.context = context;
        const { layer } = ensureShadowMount();
        layer.classList.add('interactive');

        getSelectionManager().setMaxItems(context.settings.multiSelection.maxItems);

        this.highlight = document.createElement('div');
        this.highlight.className = 'pixly-highlight';
        layer.appendChild(this.highlight);

        const coordinator = getHoverTooltipCoordinator();
        coordinator.setCopyNotifier((message) => context.showNotification(message));
        this.dimensionsSectionHandle = coordinator.registerSection(
            DIMENSIONS_SECTION_ID,
            TooltipSectionPriority.Dimensions,
        );

        document.addEventListener('mousemove', this.handleMove, { passive: true });
        document.addEventListener('click', this.handleClick, true);
        window.addEventListener('scroll', this.handleScroll, { passive: true });
        window.addEventListener('resize', this.handleScroll, { passive: true });

        this.unsubscribeSettings = context.onSettingsChange(() => this.refreshHighlight());
    }

    disable(): void {
        document.removeEventListener('mousemove', this.handleMove);
        document.removeEventListener('click', this.handleClick, true);
        window.removeEventListener('scroll', this.handleScroll);
        window.removeEventListener('resize', this.handleScroll);

        this.highlight?.remove();
        this.dimensionsSectionHandle?.dispose();
        this.clearDistanceLabels();

        getSelectionManager().clear();

        this.highlight = null;
        this.dimensionsSectionHandle = null;
        this.currentElement = null;
        this.unsubscribeSettings?.();
        this.unsubscribeSettings = null;
        this.context = null;
    }

    onEscape(): void {
        getSelectionManager().clear();
    }

    private onClick(event: MouseEvent): void {
        // Bail only when the click landed inside a Pixly interactive surface.
        // isInsidePixlyInteractivePanel is used instead of isInsidePixlyUi:
        // when the layer has pointer-events:auto the deepest composedPath element
        // is always inside the shadow DOM, so isInsidePixlyUi would block every
        // legitimate page click.
        const deepestTarget = event.composedPath().find((node): node is Element => node instanceof Element);

        if (deepestTarget && isInsidePixlyInteractivePanel(deepestTarget)) {
            return;
        }

        if (event.shiftKey) {
            const target = elementUnderPoint(event.clientX, event.clientY);

            if (!target || isInsidePixlyUi(target)) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const manager = getSelectionManager();
            const containment = manager.hasContainmentWith(target);
            const result = manager.toggle(target);

            if (result === 'limit-reached') {
                this.context?.showNotification(LIMIT_REACHED_PREFIX);

                return;
            }

            if (containment && result === 'added') {
                const now = performance.now();

                if (now - this.lastParentChildWarningAt > PARENT_CHILD_WARNING_MS) {
                    this.lastParentChildWarningAt = now;
                    this.context?.showNotification('These elements have a parent-child relationship; distances may not be representative.');
                }
            }

            return;
        }

        if ((event.ctrlKey || event.metaKey) && !event.shiftKey) {
            const target = elementUnderPoint(event.clientX, event.clientY);

            if (!target || isInsidePixlyUi(target)) {
                return;
            }

            const manager = getSelectionManager();

            if (manager.listElements().includes(target)) {
                event.preventDefault();
                event.stopPropagation();
                manager.toggle(target);
            }
        }
    }

    private onMouseMove(event: MouseEvent): void {
        const now = performance.now();

        if (now - this.lastUpdate < MOUSE_THROTTLE_MS) {
            return;
        }

        this.lastUpdate = now;

        const element = elementUnderPoint(event.clientX, event.clientY);

        if (!element || !isElementVisible(element)) {
            this.hide();

            return;
        }

        this.currentElement = element;
        this.refreshHighlight();
    }

    private refreshHighlight(): void {
        if (!this.currentElement || !this.highlight) {
            return;
        }

        const rect = this.currentElement.getBoundingClientRect();
        this.highlight.style.left = `${rect.left}px`;
        this.highlight.style.top = `${rect.top}px`;
        this.highlight.style.width = `${rect.width}px`;
        this.highlight.style.height = `${rect.height}px`;
        this.highlight.style.display = 'block';

        const coordinator = getHoverTooltipCoordinator();
        const suppressed = shouldSuppressHoverTooltip(
            this.context?.settings.inspectorPanel.hideFloatingTooltip ?? false,
        );

        coordinator.setSuppressed(suppressed);

        if (suppressed) {
            // The sidebar already exposes this info, so we still draw the
            // adjacent-edge distance labels but skip filling the section.
            this.dimensionsSectionHandle?.clear();
            this.renderAdjacentDistances(rect);

            return;
        }

        const unit = this.context?.settings.measurementUnit ?? 'px';
        const width = pxToUnit(rect.width, unit);
        const height = pxToUnit(rect.height, unit);
        const selectedCount = getSelectionManager().listElements().length;
        const selectionLabel = selectedCount > 0
            ? `${selectedCount} element${selectedCount === SINGLE_ITEM_COUNT ? '' : 's'}`
            : null;

        const rows = [{ label: DIMENSIONS_ROW_LABEL, value: `${width} × ${height}` }];

        if (selectionLabel !== null) {
            rows.push({ label: MULTI_SELECTION_ROW_LABEL, value: selectionLabel });
        }

        this.dimensionsSectionHandle?.update({
            title: DIMENSIONS_SECTION_TITLE,
            rows,
        });

        // Provide the anchor to the coordinator. The header will display the
        // compact selector for this element across every active hover tool.
        coordinator.setTarget(this.currentElement, rect);

        this.renderAdjacentDistances(rect);
    }

    private refreshAll(): void {
        this.refreshHighlight();
        getSelectionManager().refreshHighlights();
    }

    private renderAdjacentDistances(rect: DOMRect): void {
        this.clearDistanceLabels();

        if (!this.currentElement) {
            return;
        }

        const { layer } = ensureShadowMount();
        const unit = this.context?.settings.measurementUnit ?? 'px';
        const sibling = this.currentElement.parentElement;

        if (!sibling) {
            return;
        }

        const parentRect = sibling.getBoundingClientRect();
        const distances = {
            top: Math.max(NO_SIBLING_DISTANCE, rect.top - parentRect.top),
            bottom: Math.max(NO_SIBLING_DISTANCE, parentRect.bottom - rect.bottom),
            left: Math.max(NO_SIBLING_DISTANCE, rect.left - parentRect.left),
            right: Math.max(NO_SIBLING_DISTANCE, parentRect.right - rect.right),
        };

        const labels: Array<{ value: number; x: number; y: number }> = [
            { value: distances.top, x: rect.left + rect.width / 2, y: rect.top - TOOLTIP_OFFSET_PX },
            { value: distances.bottom, x: rect.left + rect.width / 2, y: rect.bottom + TOOLTIP_OFFSET_PX },
            { value: distances.left, x: rect.left - TOOLTIP_OFFSET_PX, y: rect.top + rect.height / 2 },
            { value: distances.right, x: rect.right + TOOLTIP_OFFSET_PX, y: rect.top + rect.height / 2 },
        ];

        for (const { value, x, y } of labels) {
            if (value <= NO_SIBLING_DISTANCE) {
                continue;
            }

            const label = document.createElement('div');
            label.className = 'pixly-distance-label';
            label.textContent = pxToUnit(value, unit);
            label.style.left = `${x}px`;
            label.style.top = `${y}px`;
            label.style.transform = 'translate(-50%, -50%)';
            layer.appendChild(label);
            this.distanceLabels.push(label);
        }
    }

    private clearDistanceLabels(): void {
        for (const label of this.distanceLabels) {
            label.remove();
        }

        this.distanceLabels = [];
    }

    private hide(): void {
        if (this.highlight) this.highlight.style.display = 'none';
        this.dimensionsSectionHandle?.clear();
        this.clearDistanceLabels();
        this.currentElement = null;
    }

    getCurrentElement(): Element | null {
        return this.currentElement;
    }
}
