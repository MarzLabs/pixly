// Distance meter (v2): pin + hover model. One click fixes an anchor element
// and subsequent mouse movements draw live distances between the pinned and
// hovered element. Pinning also drops four auto-guides aligned to the pinned
// element's edges so the user can visually verify alignment.

import { ColorToken, ZIndex } from '@/shared/constants/design-tokens';
import { PIXLY_INTERACTIVE_ATTR } from '@/shared/constants/ui';
import { rectDistances, rectFromDomRect } from '@/shared/utils/measurements';
import { describeElement, elementUnderPoint, isElementVisible, isInsidePixlyUi, isInsidePixlyInteractivePanel } from '@/shared/utils/dom';
import { getGuideManager, type AutoGuide } from '../guides/guide-manager';
import { ensureShadowMount } from '../shadow-host';
import type { Tool, ToolContext } from './tool';

const MOUSE_THROTTLE_MS = 16;
const PIN_LABEL_TEXT = 'Pin';
const PIN_OFFSET_PX = 8;
const PIN_REMOVED_MESSAGE = 'El elemento fijado ya no existe en la página.';
const PIN_TOOLTIP_OFFSET_PX = 12;
const HOVER_DEBOUNCE_MS = 8;
const DASHED_LINE_THICKNESS_PX = 1;
const SAME_ELEMENT_HIDE_LIVE = true;

export class DistanceMeterTool implements Tool {
    private context: ToolContext | null = null;
    private pinnedElement: Element | null = null;
    private hoveredElement: Element | null = null;
    private pinnedHighlight: HTMLDivElement | null = null;
    private pinMarker: HTMLDivElement | null = null;
    private hoverHighlight: HTMLDivElement | null = null;
    private liveLabel: HTMLDivElement | null = null;
    private liveLines: HTMLDivElement[] = [];
    private autoGuides: AutoGuide[] = [];
    private lastMouseMoveAt = 0;
    private domObserver: MutationObserver | null = null;
    private readonly handleClick = this.onClick.bind(this);
    private readonly handleMouseMove = this.onMouseMove.bind(this);
    private readonly handleScroll = this.refreshAll.bind(this);
    private hoverDebounceTimer: number | null = null;

    enable(context: ToolContext): void {
        this.context = context;
        const { layer } = ensureShadowMount();
        layer.classList.add('interactive');

        document.addEventListener('click', this.handleClick, true);
        document.addEventListener('mousemove', this.handleMouseMove, { passive: true });
        window.addEventListener('scroll', this.handleScroll, { passive: true });
        window.addEventListener('resize', this.handleScroll, { passive: true });

        this.context?.showNotification('Haz click sobre un elemento para fijarlo. Luego mueve el cursor para medir.');
    }

    disable(): void {
        document.removeEventListener('click', this.handleClick, true);
        document.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('scroll', this.handleScroll);
        window.removeEventListener('resize', this.handleScroll);

        this.clearAll();

        const { layer } = ensureShadowMount();
        layer.classList.remove('interactive');
        this.context = null;
    }

    onEscape(): void {
        this.unpin();
    }

    private onClick(event: MouseEvent): void {
        // Bail if the click originated inside Pixly UI (sidebar, tooltips,
        // panels). Only the deepest target (first Element in composedPath) is
        // checked. isInsidePixlyInteractivePanel is used instead of
        // isInsidePixlyUi: when the layer has pointer-events:auto the deepest
        // composedPath element is always inside the shadow DOM, so
        // isInsidePixlyUi would block every legitimate page click.
        const deepestTarget = event.composedPath().find((node): node is Element => node instanceof Element);

        if (deepestTarget && isInsidePixlyInteractivePanel(deepestTarget)) {
            return;
        }

        const element = elementUnderPoint(event.clientX, event.clientY);

        if (!element || isInsidePixlyUi(element)) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        // Clicking the pinned element again un-pins it.
        if (this.pinnedElement === element) {
            this.unpin();

            return;
        }

        this.pin(element);
    }

    private onMouseMove(event: MouseEvent): void {
        if (!this.pinnedElement) {
            return;
        }

        const now = performance.now();

        if (now - this.lastMouseMoveAt < MOUSE_THROTTLE_MS) {
            return;
        }

        this.lastMouseMoveAt = now;

        if (this.hoverDebounceTimer !== null) {
            window.clearTimeout(this.hoverDebounceTimer);
        }

        this.hoverDebounceTimer = window.setTimeout(() => {
            this.updateHover(event.clientX, event.clientY);
        }, HOVER_DEBOUNCE_MS);
    }

    private updateHover(x: number, y: number): void {
        const candidate = elementUnderPoint(x, y);

        if (!candidate || isInsidePixlyUi(candidate)) {
            this.clearHover();

            return;
        }

        this.hoveredElement = candidate;
        this.refreshHoverHighlight();

        if (candidate === this.pinnedElement && SAME_ELEMENT_HIDE_LIVE) {
            this.clearLiveDistance();

            return;
        }

        this.drawLiveDistance();
    }

    private pin(element: Element): void {
        this.unpin();

        if (!isElementVisible(element)) {
            return;
        }

        this.pinnedElement = element;
        this.installPinnedHighlight();
        this.installPinMarker();
        this.installAutoGuides();
        this.installDomObserver();
    }

    private unpin(): void {
        this.pinnedElement = null;
        this.hoveredElement = null;

        this.pinnedHighlight?.remove();
        this.pinnedHighlight = null;

        this.pinMarker?.remove();
        this.pinMarker = null;

        this.hoverHighlight?.remove();
        this.hoverHighlight = null;

        this.clearLiveDistance();
        this.clearAutoGuides();
        this.disposeDomObserver();
    }

    private clearAll(): void {
        this.unpin();

        if (this.hoverDebounceTimer !== null) {
            window.clearTimeout(this.hoverDebounceTimer);
            this.hoverDebounceTimer = null;
        }
    }

    // ---------- Pinned element visuals ----------

    private installPinnedHighlight(): void {
        if (!this.pinnedElement) {
            return;
        }

        const { layer } = ensureShadowMount();
        this.pinnedHighlight = document.createElement('div');
        this.pinnedHighlight.className = 'pixly-highlight pinned';
        layer.appendChild(this.pinnedHighlight);

        this.refreshPinnedHighlight();
    }

    private refreshPinnedHighlight(): void {
        if (!this.pinnedElement || !this.pinnedHighlight) {
            return;
        }

        const rect = this.pinnedElement.getBoundingClientRect();
        this.pinnedHighlight.style.left = `${rect.left}px`;
        this.pinnedHighlight.style.top = `${rect.top}px`;
        this.pinnedHighlight.style.width = `${rect.width}px`;
        this.pinnedHighlight.style.height = `${rect.height}px`;
    }

    private installPinMarker(): void {
        if (!this.pinnedElement) {
            return;
        }

        const { layer } = ensureShadowMount();
        const rect = this.pinnedElement.getBoundingClientRect();

        this.pinMarker = document.createElement('div');
        this.pinMarker.className = 'pixly-pin-marker';
        this.pinMarker.textContent = `${PIN_LABEL_TEXT} ${describeElement(this.pinnedElement)}`;
        this.pinMarker.style.left = `${rect.left + PIN_OFFSET_PX}px`;
        this.pinMarker.style.top = `${rect.top - 20 - PIN_OFFSET_PX}px`;
        layer.appendChild(this.pinMarker);
    }

    private refreshPinMarker(): void {
        if (!this.pinnedElement || !this.pinMarker) {
            return;
        }

        const rect = this.pinnedElement.getBoundingClientRect();
        this.pinMarker.style.left = `${rect.left + PIN_OFFSET_PX}px`;
        this.pinMarker.style.top = `${rect.top - 20 - PIN_OFFSET_PX}px`;
    }

    // ---------- Auto guides ----------

    private installAutoGuides(): void {
        if (!this.pinnedElement) {
            return;
        }

        const rect = this.pinnedElement.getBoundingClientRect();
        const manager = getGuideManager();
        const sourceLabel = describeElement(this.pinnedElement);

        this.autoGuides = [
            manager.createAutoGuide('horizontal', rect.top, sourceLabel),
            manager.createAutoGuide('horizontal', rect.bottom, sourceLabel),
            manager.createAutoGuide('vertical', rect.left, sourceLabel),
            manager.createAutoGuide('vertical', rect.right, sourceLabel),
        ];
    }

    private refreshAutoGuides(): void {
        if (!this.pinnedElement || this.autoGuides.length === 0) {
            return;
        }

        const rect = this.pinnedElement.getBoundingClientRect();
        const manager = getGuideManager();

        manager.updateAutoGuide(this.autoGuides[0], rect.top);
        manager.updateAutoGuide(this.autoGuides[1], rect.bottom);
        manager.updateAutoGuide(this.autoGuides[2], rect.left);
        manager.updateAutoGuide(this.autoGuides[3], rect.right);
    }

    private clearAutoGuides(): void {
        if (this.autoGuides.length === 0) {
            return;
        }

        // Only clear the auto-guides we created. If other pins are active we'd
        // want to remove only ours — but at most one element can be pinned, so
        // calling the manager's bulk clear is safe.
        getGuideManager().clearAutoGuides();
        this.autoGuides = [];
    }

    // ---------- Hover highlight + live distance ----------

    private refreshHoverHighlight(): void {
        if (!this.hoveredElement) {
            this.hoverHighlight?.remove();
            this.hoverHighlight = null;

            return;
        }

        const { layer } = ensureShadowMount();

        if (!this.hoverHighlight) {
            this.hoverHighlight = document.createElement('div');
            this.hoverHighlight.className = 'pixly-highlight';
            layer.appendChild(this.hoverHighlight);
        }

        const rect = this.hoveredElement.getBoundingClientRect();
        this.hoverHighlight.style.left = `${rect.left}px`;
        this.hoverHighlight.style.top = `${rect.top}px`;
        this.hoverHighlight.style.width = `${rect.width}px`;
        this.hoverHighlight.style.height = `${rect.height}px`;
    }

    private clearHover(): void {
        this.hoveredElement = null;
        this.hoverHighlight?.remove();
        this.hoverHighlight = null;
        this.clearLiveDistance();
    }

    private drawLiveDistance(): void {
        this.clearLiveDistance();

        if (!this.pinnedElement || !this.hoveredElement) {
            return;
        }

        const rectA = rectFromDomRect(this.pinnedElement.getBoundingClientRect());
        const rectB = rectFromDomRect(this.hoveredElement.getBoundingClientRect());
        const distances = rectDistances(rectA, rectB);

        this.installLiveLines(rectA, rectB);
        this.installLiveLabel(rectA, rectB, distances.horizontal, distances.vertical, distances.diagonal);
    }

    private installLiveLines(rectA: DOMRect | ReturnType<typeof rectFromDomRect>, rectB: DOMRect | ReturnType<typeof rectFromDomRect>): void {
        const { layer } = ensureShadowMount();
        const centerAX = rectA.left + rectA.width / 2;
        const centerAY = rectA.top + rectA.height / 2;
        const centerBX = rectB.left + rectB.width / 2;
        const centerBY = rectB.top + rectB.height / 2;

        // Horizontal segment.
        const horizontal = document.createElement('div');
        horizontal.className = 'pixly-distance-line dashed';
        const minX = Math.min(centerAX, centerBX);
        const maxX = Math.max(centerAX, centerBX);
        horizontal.style.left = `${minX}px`;
        horizontal.style.top = `${centerAY}px`;
        horizontal.style.width = `${maxX - minX}px`;
        horizontal.style.height = `${DASHED_LINE_THICKNESS_PX}px`;
        horizontal.style.zIndex = String(ZIndex.DistanceLabel - 1);
        layer.appendChild(horizontal);
        this.liveLines.push(horizontal);

        // Vertical segment.
        const vertical = document.createElement('div');
        vertical.className = 'pixly-distance-line vertical-dashed';
        const minY = Math.min(centerAY, centerBY);
        const maxY = Math.max(centerAY, centerBY);
        vertical.style.left = `${centerBX}px`;
        vertical.style.top = `${minY}px`;
        vertical.style.width = `${DASHED_LINE_THICKNESS_PX}px`;
        vertical.style.height = `${maxY - minY}px`;
        vertical.style.zIndex = String(ZIndex.DistanceLabel - 1);
        layer.appendChild(vertical);
        this.liveLines.push(vertical);
    }

    private installLiveLabel(
        rectA: ReturnType<typeof rectFromDomRect>,
        rectB: ReturnType<typeof rectFromDomRect>,
        horizontal: number,
        vertical: number,
        diagonal: number,
    ): void {
        const { layer } = ensureShadowMount();
        this.liveLabel = document.createElement('div');
        this.liveLabel.className = 'pixly-tooltip';
        this.liveLabel.setAttribute(PIXLY_INTERACTIVE_ATTR, 'true');
        this.liveLabel.style.zIndex = String(ZIndex.Tooltip);
        this.liveLabel.innerHTML = `
            <div><strong>Pin → Hover</strong></div>
            <div class="pixly-tooltip-muted">${describeElement(this.hoveredElement as Element)}</div>
            <div>Horizontal: ${Math.round(horizontal)}px</div>
            <div>Vertical: ${Math.round(vertical)}px</div>
            <div>Diagonal: ${Math.round(diagonal)}px</div>
        `;

        const midX = (rectA.left + rectB.left + rectB.width) / 2;
        const midY = (rectA.top + rectB.top + rectB.height) / 2;
        this.liveLabel.style.left = `${midX + PIN_TOOLTIP_OFFSET_PX}px`;
        this.liveLabel.style.top = `${midY + PIN_TOOLTIP_OFFSET_PX}px`;
        this.liveLabel.style.display = 'block';

        // Suppress the placeholder colors hint.
        this.liveLabel.style.background = ColorToken.OverlayBackground;

        layer.appendChild(this.liveLabel);
    }

    private clearLiveDistance(): void {
        for (const line of this.liveLines) {
            line.remove();
        }

        this.liveLines = [];

        this.liveLabel?.remove();
        this.liveLabel = null;
    }

    // ---------- Refresh on layout changes ----------

    private refreshAll(): void {
        this.refreshPinnedHighlight();
        this.refreshPinMarker();
        this.refreshAutoGuides();

        if (this.hoveredElement) {
            this.refreshHoverHighlight();
            this.drawLiveDistance();
        }
    }

    // ---------- DOM observer (rule: pinned element disappearing) ----------

    private installDomObserver(): void {
        if (!this.pinnedElement) {
            return;
        }

        this.domObserver = new MutationObserver(() => {
            if (!this.pinnedElement) {
                return;
            }

            if (!document.contains(this.pinnedElement)) {
                this.unpin();
                this.context?.showNotification(PIN_REMOVED_MESSAGE);
            }
        });

        this.domObserver.observe(document.body, { childList: true, subtree: true });
    }

    private disposeDomObserver(): void {
        this.domObserver?.disconnect();
        this.domObserver = null;
    }

    // ---------- Public state (used by other tools) ----------

    getPinnedElement(): Element | null {
        return this.pinnedElement;
    }
}
