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

import { elementUnderPoint, isElementVisible, isInsidePixlyUi, isInsidePixlyInteractivePanel } from '@/shared/utils/dom';
import { clipSegmentToViewport, pxToUnit, type Point } from '@/shared/utils/measurements';
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
// Below this length the label would visually collide with either the element
// or the parent edge, so we draw the dashed line but hide the numeric label.
const MIN_LINE_LENGTH_FOR_LABEL_PX = 16;
// Inset from the viewport edges used when clamping adjacent-distance segments.
// Keeps the dashed line from touching the very edge of the screen, which would
// look glued to the chrome and make the fade-out mask less perceptible.
const VIEWPORT_CLAMP_MARGIN_PX = 4;
const HALF_DIVISOR = 2;
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
    private distanceLines: HTMLDivElement[] = [];
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

        const parent = this.currentElement.parentElement;

        if (!parent) {
            return;
        }

        const { layer } = ensureShadowMount();
        const unit = this.context?.settings.measurementUnit ?? 'px';
        const parentRect = parent.getBoundingClientRect();
        const elementCenterX = rect.left + rect.width / HALF_DIVISOR;
        const elementCenterY = rect.top + rect.height / HALF_DIVISOR;
        const viewport = { width: window.innerWidth, height: window.innerHeight };

        // Each side describes one dashed measurement line from the element's
        // edge to the parent's matching edge. `length` is the raw on-screen
        // distance (used for the label text); the actual visible geometry is
        // computed by clipping the segment to the viewport, so labels track
        // the visible midpoint even when the parent extends off-screen.
        const sides = [
            {
                length: Math.max(NO_SIBLING_DISTANCE, rect.top - parentRect.top),
                orientation: 'vertical' as const,
                start: { x: elementCenterX, y: parentRect.top },
                end: { x: elementCenterX, y: rect.top },
            },
            {
                length: Math.max(NO_SIBLING_DISTANCE, parentRect.bottom - rect.bottom),
                orientation: 'vertical' as const,
                start: { x: elementCenterX, y: rect.bottom },
                end: { x: elementCenterX, y: parentRect.bottom },
            },
            {
                length: Math.max(NO_SIBLING_DISTANCE, rect.left - parentRect.left),
                orientation: 'horizontal' as const,
                start: { x: parentRect.left, y: elementCenterY },
                end: { x: rect.left, y: elementCenterY },
            },
            {
                length: Math.max(NO_SIBLING_DISTANCE, parentRect.right - rect.right),
                orientation: 'horizontal' as const,
                start: { x: rect.right, y: elementCenterY },
                end: { x: parentRect.right, y: elementCenterY },
            },
        ];

        for (const side of sides) {
            if (side.length <= NO_SIBLING_DISTANCE) {
                continue;
            }

            const clipped = clipSegmentToViewport(
                side.start,
                side.end,
                viewport,
                VIEWPORT_CLAMP_MARGIN_PX,
            );

            if (clipped.visibleLength <= NO_SIBLING_DISTANCE) {
                continue;
            }

            const line = this.createDistanceLine(
                side.orientation,
                clipped.start,
                clipped.end,
                clipped.clippedStart,
                clipped.clippedEnd,
            );
            layer.appendChild(line);
            this.distanceLines.push(line);

            if (clipped.visibleLength < MIN_LINE_LENGTH_FOR_LABEL_PX) {
                continue;
            }

            const midX = (clipped.start.x + clipped.end.x) / HALF_DIVISOR;
            const midY = (clipped.start.y + clipped.end.y) / HALF_DIVISOR;
            const label = document.createElement('div');
            label.className = 'pixly-distance-label';
            label.textContent = pxToUnit(side.length, unit);
            label.style.left = `${midX}px`;
            label.style.top = `${midY}px`;
            label.style.transform = 'translate(-50%, -50%)';
            layer.appendChild(label);
            this.distanceLabels.push(label);
        }
    }

    private createDistanceLine(
        orientation: 'horizontal' | 'vertical',
        start: Point,
        end: Point,
        clippedStart: boolean,
        clippedEnd: boolean,
    ): HTMLDivElement {
        const line = document.createElement('div');
        const baseClass = orientation === 'horizontal'
            ? 'pixly-distance-line dashed'
            : 'pixly-distance-line vertical-dashed';
        const clipClasses = [
            clippedStart ? 'clipped-start' : '',
            clippedEnd ? 'clipped-end' : '',
        ].filter((value) => value !== '').join(' ');
        line.className = clipClasses === ''
            ? baseClass
            : `${baseClass} ${clipClasses}`;

        if (orientation === 'horizontal') {
            const minX = Math.min(start.x, end.x);
            const maxX = Math.max(start.x, end.x);
            line.style.left = `${minX}px`;
            line.style.top = `${start.y}px`;
            line.style.width = `${maxX - minX}px`;

            return line;
        }

        const minY = Math.min(start.y, end.y);
        const maxY = Math.max(start.y, end.y);
        line.style.left = `${start.x}px`;
        line.style.top = `${minY}px`;
        line.style.height = `${maxY - minY}px`;

        return line;
    }

    private clearDistanceLabels(): void {
        for (const label of this.distanceLabels) {
            label.remove();
        }

        for (const line of this.distanceLines) {
            line.remove();
        }

        this.distanceLabels = [];
        this.distanceLines = [];
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
