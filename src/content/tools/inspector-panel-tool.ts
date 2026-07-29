// Inspector panel: a persistent sidebar that reports the full set of CSS
// properties, box model and DOM tree info for whatever element the user
// hovers over (or pins). Inspired by Figma's right-side panel.

import { INSPECTOR_PANEL_MAX_CHILDREN } from '@/shared/constants/ui';
import { ColorToken } from '@/shared/constants/design-tokens';
import { cssColorToHex } from '@/shared/utils/colors';
import { shouldHandleClick } from '@/shared/utils/click-guard';
import { buildElementSpecs, formatSpecsForClipboard, type ElementSpecs } from '@/shared/utils/css-specs';
import { copyTextToClipboard, describeElement, elementUnderPoint, isElementVisible, isInsidePixlyUi, isInsidePixlyInteractivePanel } from '@/shared/utils/dom';
import { PIXLY_INTERACTIVE_ATTR } from '@/shared/constants/ui';
import { saveSettings } from '@/shared/utils/storage';
import { sendMessageToRuntime } from '@/shared/messaging';
import { MessageType } from '@/shared/types/messages';
import type { InspectorPanelSide } from '@/shared/types/settings';
import { getSelectionManager, type SelectionSummary } from '../selection/selection-manager';
import { ensureShadowMount } from '../shadow-host';
import type { Tool, ToolContext } from './tool';

const HOVER_THROTTLE_MS = 60;
const COPIED_FLASH_MS = 800;
const COPY_CONFIRMATION_TEXT = 'Copied';
const COPY_ALL_SPECS_SUCCESS = 'Specs copied to clipboard.';
const COPY_ALL_SPECS_FAILURE = 'Unable to copy to clipboard.';
const COPY_ALL_SPECS_NO_ELEMENT = 'Hover over or select an element first.';

interface PanelSection {
    id: string;
    title: string;
    collapsed: boolean;
}

const SECTION_IDS = {
    Box: 'box',
    Typography: 'typography',
    Colors: 'colors',
    Layout: 'layout',
    Border: 'border',
    Attributes: 'attributes',
    Tree: 'tree',
} as const;

export class InspectorPanelTool implements Tool {
    private context: ToolContext | null = null;
    private container: HTMLDivElement | null = null;
    private bodyEl: HTMLDivElement | null = null;
    private currentElement: Element | null = null;
    private pinnedElement: Element | null = null;
    private lastHoverUpdate = 0;
    private unsubscribeSettings: (() => void) | null = null;
    private unsubscribeSelection: (() => void) | null = null;
    private selectionSummary: SelectionSummary | null = null;
    private side: InspectorPanelSide = 'right';
    private readonly sections: PanelSection[] = [
        { id: SECTION_IDS.Box, title: 'Box model', collapsed: false },
        { id: SECTION_IDS.Typography, title: 'Typography', collapsed: false },
        { id: SECTION_IDS.Colors, title: 'Colors', collapsed: false },
        { id: SECTION_IDS.Layout, title: 'Layout', collapsed: false },
        { id: SECTION_IDS.Border, title: 'Border & shadow', collapsed: true },
        { id: SECTION_IDS.Attributes, title: 'Attributes', collapsed: true },
        { id: SECTION_IDS.Tree, title: 'DOM tree', collapsed: false },
    ];
    private readonly handleMouseMove = this.onMouseMove.bind(this);
    private readonly handleScroll = this.refreshIfNeeded.bind(this);
    private readonly handleDocumentClick = this.onDocumentClick.bind(this);

    enable(context: ToolContext): void {
        this.context = context;
        this.side = context.settings.inspectorPanel.side;

        this.installPanel();
        document.addEventListener('mousemove', this.handleMouseMove, { passive: true });
        document.addEventListener('click', this.handleDocumentClick, true);
        window.addEventListener('scroll', this.handleScroll, { passive: true });
        window.addEventListener('resize', this.handleScroll, { passive: true });

        this.unsubscribeSettings = context.onSettingsChange((settings) => {
            const nextSide = settings.inspectorPanel.side;

            if (nextSide !== this.side) {
                this.side = nextSide;
                this.updateSideClass();
            }
        });

        // React to multi-selection changes so the panel can swap between the
        // single-element view and the collective view.
        this.unsubscribeSelection = getSelectionManager().onChange((summary) => {
            this.selectionSummary = summary.elements.length >= 2 ? summary : null;
            this.renderBody();
        });
    }

    disable(): void {
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('click', this.handleDocumentClick, true);
        window.removeEventListener('scroll', this.handleScroll);
        window.removeEventListener('resize', this.handleScroll);

        this.unsubscribeSettings?.();
        this.unsubscribeSettings = null;
        this.unsubscribeSelection?.();
        this.unsubscribeSelection = null;

        this.container?.remove();
        this.container = null;
        this.bodyEl = null;
        this.currentElement = null;
        this.pinnedElement = null;
        this.selectionSummary = null;
        this.context = null;
    }

    onEscape(): void {
        if (this.pinnedElement) {
            this.pinnedElement = null;
            this.renderBody();
        }
    }

    // ---------- Panel scaffolding ----------

    private installPanel(): void {
        const { layer } = ensureShadowMount();
        layer.classList.add('interactive');

        this.container = document.createElement('div');
        this.container.className = 'pixly-inspector-panel';
        this.container.setAttribute(PIXLY_INTERACTIVE_ATTR, 'true');
        this.updateSideClass();

        this.container.innerHTML = `
            <div class="pixly-inspector-header">
                <div class="pixly-inspector-title">Inspector</div>
                <div class="pixly-inspector-actions">
                    <button type="button" class="pixly-icon-btn" data-action="copy-all" title="Copy all specs for this element" aria-label="Copy all specs">
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                            <rect x="4" y="3" width="9" height="11" rx="1.5"></rect>
                            <path d="M6 3V2.5A1.5 1.5 0 0 1 7.5 1h2A1.5 1.5 0 0 1 11 2.5V3"></path>
                        </svg>
                    </button>
                    <button type="button" class="pixly-icon-btn" data-action="pin" title="Pin current element">Pin</button>
                    <button type="button" class="pixly-icon-btn" data-action="side" title="Switch side">Side</button>
                    <button type="button" class="pixly-icon-btn" data-action="close" title="Close panel">×</button>
                </div>
            </div>
            <div class="pixly-inspector-body"></div>
        `;

        this.bodyEl = this.container.querySelector<HTMLDivElement>('.pixly-inspector-body');

        const copyAllButton = this.container.querySelector<HTMLButtonElement>('[data-action="copy-all"]');
        const pinButton = this.container.querySelector<HTMLButtonElement>('[data-action="pin"]');
        const sideButton = this.container.querySelector<HTMLButtonElement>('[data-action="side"]');
        const closeButton = this.container.querySelector<HTMLButtonElement>('[data-action="close"]');

        copyAllButton?.addEventListener('click', () => void this.copyAllSpecs());
        pinButton?.addEventListener('click', () => this.togglePin());
        sideButton?.addEventListener('click', () => this.toggleSide());
        closeButton?.addEventListener('click', () => this.closePanel());

        layer.appendChild(this.container);
        this.updateCopyAllButtonState();
        this.renderBody();
    }

    private updateSideClass(): void {
        if (!this.container) return;

        this.container.classList.remove('side-right', 'side-left');
        this.container.classList.add(this.side === 'right' ? 'side-right' : 'side-left');
    }

    private togglePin(): void {
        if (this.pinnedElement) {
            this.pinnedElement = null;
        } else if (this.currentElement) {
            this.pinnedElement = this.currentElement;
        }

        this.renderBody();
    }

    private toggleSide(): void {
        this.side = this.side === 'right' ? 'left' : 'right';
        this.updateSideClass();

        if (!this.context) return;

        // Same settings object the popup's "Inspector panel side" preference
        // reads and writes, so both surfaces share one source of truth.
        (this.context.settings.inspectorPanel as { side: InspectorPanelSide }).side = this.side;
        void saveSettings(this.context.settings);

        // Fire-and-forget — the popup may not be open, which is fine. Keeps
        // its preference dropdown in sync if it is.
        void sendMessageToRuntime({
            type: MessageType.UpdateSettings,
            payload: { settings: this.context.settings },
        });
    }

    private closePanel(): void {
        if (this.context) {
            this.context.showNotification('Inspector panel closed.');
        }

        this.disable();
    }

    // Build the same spec block CaptureSpecs used to produce and copy it to the
    // clipboard. Designers paste the result into Slack/Figma/issues.
    private async copyAllSpecs(): Promise<void> {
        const target = this.activeElement();

        if (!target) {
            this.context?.showNotification(COPY_ALL_SPECS_NO_ELEMENT);

            return;
        }

        const specs = buildElementSpecs(target);
        const text = formatSpecsForClipboard(specs);
        const ok = await copyTextToClipboard(text);

        this.context?.showNotification(ok ? COPY_ALL_SPECS_SUCCESS : COPY_ALL_SPECS_FAILURE);
    }

    private activeElement(): Element | null {
        return this.pinnedElement ?? this.currentElement;
    }

    private updateCopyAllButtonState(): void {
        if (!this.container) {
            return;
        }

        const button = this.container.querySelector<HTMLButtonElement>('[data-action="copy-all"]');

        if (!button) {
            return;
        }

        button.disabled = this.activeElement() === null;
    }

    // ---------- Hover tracking ----------

    private onMouseMove(event: MouseEvent): void {
        if (this.pinnedElement) {
            return;
        }

        const now = performance.now();

        if (now - this.lastHoverUpdate < HOVER_THROTTLE_MS) {
            return;
        }

        this.lastHoverUpdate = now;

        const candidate = elementUnderPoint(event.clientX, event.clientY);

        if (!candidate || isInsidePixlyUi(candidate) || !isElementVisible(candidate)) {
            return;
        }

        if (candidate === this.currentElement) {
            return;
        }

        this.currentElement = candidate;
        this.renderBody();
    }

    private refreshIfNeeded(): void {
        this.renderBody();
    }

    // ---------- Click-to-pin ----------

    // Click on any page element to pin it. Clicking the already-pinned element
    // un-pins it (mirrors the header Pin button toggle). Intentionally does
    // NOT stopPropagation so other tools (e.g. DistanceMeterTool) can also
    // react to the same click in capture phase.
    private onDocumentClick(event: MouseEvent): void {
        if (!shouldHandleClick(event)) {
            return;
        }

        // Bail only when the click landed inside a Pixly interactive surface
        // (sidebar, tooltip with buttons, ruler, etc.) identified by
        // data-pixly-interactive="true". Using isInsidePixlyUi here is wrong:
        // when the layer has pointer-events:auto the deepest composedPath element
        // is always inside the shadow DOM, so isInsidePixlyUi would block every
        // legitimate page click.
        const deepestTarget = event.composedPath().find((node): node is Element => node instanceof Element);

        if (deepestTarget && isInsidePixlyInteractivePanel(deepestTarget)) {
            return;
        }

        const target = elementUnderPoint(event.clientX, event.clientY);

        if (!target || isInsidePixlyUi(target)) {
            return;
        }

        event.preventDefault();

        if (this.pinnedElement === target) {
            this.pinnedElement = null;
            this.renderBody();

            return;
        }

        this.pinnedElement = target;
        this.currentElement = target;
        this.renderBody();
    }

    // ---------- Body rendering ----------

    private renderBody(): void {
        if (!this.bodyEl) return;

        this.updateCopyAllButtonState();

        // Multi-selection view takes priority when the user has shift-clicked
        // multiple elements, as per the spec's scenario 6.
        if (this.selectionSummary) {
            this.bodyEl.innerHTML = '';
            this.bodyEl.appendChild(this.renderMultiSelection(this.selectionSummary));

            return;
        }

        const target = this.pinnedElement ?? this.currentElement;

        if (!target) {
            this.bodyEl.innerHTML = `
                <div class="pixly-inspector-empty">
                    Hover over an element to inspect it.<br/>
                    Press <strong>Pin</strong> to lock it and keep the information.
                </div>
            `;

            return;
        }

        const specs = buildElementSpecs(target);

        this.bodyEl.innerHTML = '';
        this.bodyEl.appendChild(this.renderHeader(target));

        for (const section of this.sections) {
            const node = this.renderSection(section, target, specs);
            this.bodyEl.appendChild(node);
        }
    }

    private renderMultiSelection(summary: SelectionSummary): HTMLElement {
        const node = document.createElement('div');
        node.className = 'pixly-inspector-section';

        const elementsList = summary.elements
            .map((element, index) => `<div class="pixly-inspector-row"><span class="pixly-inspector-label">${index + 1}</span><span class="pixly-inspector-value" data-copy="${this.escape(describeElement(element))}">${this.escape(describeElement(element))}</span></div>`)
            .join('');

        const boundingBoxRow = summary.boundingBox
            ? `
                <div class="pixly-inspector-row">
                    <span class="pixly-inspector-label">Bounding box</span>
                    <span class="pixly-inspector-value" data-copy="${Math.round(summary.boundingBox.width)} × ${Math.round(summary.boundingBox.height)}">${Math.round(summary.boundingBox.width)} × ${Math.round(summary.boundingBox.height)}</span>
                </div>
            `
            : '';

        const pairRows = summary.pairs
            .map((pair) => `
                <div class="pixly-inspector-row">
                    <span class="pixly-inspector-label">${pair.fromIndex + 1} → ${pair.toIndex + 1}</span>
                    <span class="pixly-inspector-value" data-copy="H ${Math.round(pair.horizontal)} V ${Math.round(pair.vertical)} D ${Math.round(pair.diagonal)}">
                        H ${Math.round(pair.horizontal)}px · V ${Math.round(pair.vertical)}px · D ${Math.round(pair.diagonal)}px
                    </span>
                </div>
            `)
            .join('');

        node.innerHTML = `
            <div class="pixly-inspector-section-header">
                <span>Multi-selection (${summary.elements.length})</span>
                <span class="pixly-inspector-chevron">▼</span>
            </div>
            <div class="pixly-inspector-section-body">
                ${elementsList}
                ${boundingBoxRow}
                ${summary.pairs.length > 0 ? `<h4 style="margin-top:10px; color: ${ColorToken.OverlayMuted}; font-size:10px; text-transform:uppercase; letter-spacing:0.06em;">Distances between consecutive pairs</h4>${pairRows}` : ''}
            </div>
        `;

        this.bindCopyHandlers(node);

        return node;
    }

    private renderHeader(target: Element): HTMLElement {
        const node = document.createElement('div');
        node.className = 'pixly-inspector-section';
        node.style.background = this.pinnedElement === target ? ColorToken.PinnedSubtle : 'transparent';
        node.innerHTML = `
            <div class="pixly-inspector-section-body">
                <div class="pixly-inspector-row">
                    <span class="pixly-inspector-label">Selector</span>
                    <span class="pixly-inspector-value" data-copy="${this.escape(describeElement(target))}">${this.escape(describeElement(target))}</span>
                </div>
            </div>
        `;
        this.bindCopyHandlers(node);

        return node;
    }

    private renderSection(section: PanelSection, target: Element, specs: ElementSpecs): HTMLElement {
        const node = document.createElement('div');
        node.className = `pixly-inspector-section ${section.collapsed ? 'collapsed' : ''}`;
        node.innerHTML = `
            <div class="pixly-inspector-section-header" data-section-id="${section.id}">
                <span>${section.title}</span>
                <span class="pixly-inspector-chevron">▼</span>
            </div>
            <div class="pixly-inspector-section-body">${this.renderSectionContent(section.id, target, specs)}</div>
        `;

        const header = node.querySelector<HTMLDivElement>('.pixly-inspector-section-header')!;
        header.addEventListener('click', () => {
            section.collapsed = !section.collapsed;
            node.classList.toggle('collapsed', section.collapsed);
        });

        this.bindCopyHandlers(node);
        this.bindDomTreeHandlers(node, target);

        return node;
    }

    private renderSectionContent(sectionId: string, target: Element, specs: ElementSpecs): string {
        switch (sectionId) {
            case SECTION_IDS.Box:
                return this.renderBoxModel(target);
            case SECTION_IDS.Typography:
                return this.renderTypography(specs);
            case SECTION_IDS.Colors:
                return this.renderColors(specs);
            case SECTION_IDS.Layout:
                return this.renderLayout(specs);
            case SECTION_IDS.Border:
                return this.renderBorder(specs);
            case SECTION_IDS.Attributes:
                return this.renderAttributes(target);
            case SECTION_IDS.Tree:
                return this.renderDomTree(target);
            default:
                return '';
        }
    }

    private renderBoxModel(target: Element): string {
        const style = getComputedStyle(target);
        const rect = target.getBoundingClientRect();

        const marginTop = Math.round(parseFloat(style.marginTop));
        const marginRight = Math.round(parseFloat(style.marginRight));
        const marginBottom = Math.round(parseFloat(style.marginBottom));
        const marginLeft = Math.round(parseFloat(style.marginLeft));

        const paddingTop = Math.round(parseFloat(style.paddingTop));
        const paddingRight = Math.round(parseFloat(style.paddingRight));
        const paddingBottom = Math.round(parseFloat(style.paddingBottom));
        const paddingLeft = Math.round(parseFloat(style.paddingLeft));

        const width = Math.round(rect.width);
        const height = Math.round(rect.height);

        return `
            <div class="pixly-box-model">
                <div class="pixly-box-model-layer margin">
                    <span class="pixly-box-label">margin</span>
                    <div class="pixly-box-model-sides">
                        <div class="pixly-box-side-top">${marginTop}</div>
                        <div class="pixly-box-side-left">${marginLeft}</div>
                        <div class="pixly-box-side-center">
                            <div class="pixly-box-model-layer padding">
                                <span class="pixly-box-label">padding</span>
                                <div class="pixly-box-model-sides">
                                    <div class="pixly-box-side-top">${paddingTop}</div>
                                    <div class="pixly-box-side-left">${paddingLeft}</div>
                                    <div class="pixly-box-side-center">
                                        <div class="pixly-box-model-layer content">
                                            ${width} × ${height}
                                        </div>
                                    </div>
                                    <div class="pixly-box-side-right">${paddingRight}</div>
                                    <div class="pixly-box-side-bottom">${paddingBottom}</div>
                                </div>
                            </div>
                        </div>
                        <div class="pixly-box-side-right">${marginRight}</div>
                        <div class="pixly-box-side-bottom">${marginBottom}</div>
                    </div>
                </div>
            </div>
        `;
    }

    private renderTypography(specs: ElementSpecs): string {
        return [
            this.row('font-family', specs.typography.fontFamily),
            this.row('font-size', specs.typography.fontSize),
            this.row('line-height', specs.typography.lineHeight),
            this.row('letter-spacing', specs.typography.letterSpacing),
            this.row('font-weight', specs.typography.fontWeight),
            this.row('color', specs.typography.color, specs.typography.colorHex),
        ].join('');
    }

    private renderColors(specs: ElementSpecs): string {
        return [
            this.row('background', specs.background.backgroundColor, specs.background.backgroundColorHex),
            this.row('color', specs.typography.color, specs.typography.colorHex),
        ].join('');
    }

    private renderLayout(specs: ElementSpecs): string {
        return [
            this.row('display', specs.position.display),
            this.row('position', specs.position.position),
            this.row('top', specs.position.top),
            this.row('right', specs.position.right),
            this.row('bottom', specs.position.bottom),
            this.row('left', specs.position.left),
            this.row('z-index', specs.position.zIndex),
        ].join('');
    }

    private renderBorder(specs: ElementSpecs): string {
        return [
            this.row('border', specs.border.border),
            this.row('border-radius', specs.border.borderRadius),
            this.row('box-shadow', specs.shadow),
        ].join('');
    }

    private renderAttributes(target: Element): string {
        const rows: string[] = [];

        if (target.id) {
            rows.push(this.row('id', target.id));
        }

        if (target.classList.length > 0) {
            rows.push(this.row('class', Array.from(target.classList).join(' ')));
        }

        const role = target.getAttribute('role');

        if (role) {
            rows.push(this.row('role', role));
        }

        for (const attribute of Array.from(target.attributes)) {
            if (attribute.name.startsWith('aria-') || attribute.name.startsWith('data-')) {
                rows.push(this.row(attribute.name, attribute.value));
            }
        }

        if (rows.length === 0) {
            return '<div class="pixly-inspector-empty" style="padding: 12px;">No relevant attributes.</div>';
        }

        return rows.join('');
    }

    private renderDomTree(target: Element): string {
        const parent = target.parentElement;
        const allChildren = Array.from(target.children).filter((child) => isElementVisible(child) && !isInsidePixlyUi(child));
        const visibleChildren = allChildren.slice(0, INSPECTOR_PANEL_MAX_CHILDREN);
        const remaining = allChildren.length - visibleChildren.length;

        const parentNode = parent
            ? `<div class="pixly-dom-node parent" data-direction="parent">↑ ${this.escape(describeElement(parent))}</div>`
            : '<div class="pixly-dom-node" style="opacity: 0.5;">(no parent)</div>';

        const currentNode = `<div class="pixly-dom-node current">${this.escape(describeElement(target))}</div>`;

        const childrenHeader = visibleChildren.length > 0
            ? '<div class="pixly-dom-node children-header">↓ Children</div>'
            : '<div class="pixly-dom-node children-header">↓ No visible children</div>';

        const childNodes = visibleChildren
            .map((child, index) => `<div class="pixly-dom-node" data-direction="child" data-child-index="${index}">${this.escape(describeElement(child))}</div>`)
            .join('');

        const showMore = remaining > 0
            ? `<div class="pixly-dom-show-more">Show ${remaining} more</div>`
            : '';

        return `
            <div class="pixly-dom-tree">
                ${parentNode}
                ${currentNode}
                ${childrenHeader}
                ${childNodes}
                ${showMore}
            </div>
        `;
    }

    private row(label: string, rawValue: string, hexValue?: string | null): string {
        const value = rawValue?.trim() || '—';
        const displayValue = hexValue ? `${this.escape(hexValue)} <span class="pixly-inspector-label">(${this.escape(value)})</span>` : this.escape(value);
        const copyValue = hexValue ?? value;
        const swatch = hexValue ? `<span class="pixly-color-swatch" style="background: ${this.escape(hexValue)};"></span>` : '';

        return `
            <div class="pixly-inspector-row">
                <span class="pixly-inspector-label">${label}</span>
                <span class="pixly-inspector-value" data-copy="${this.escape(copyValue)}">${swatch}${displayValue}</span>
            </div>
        `;
    }

    private bindCopyHandlers(scope: HTMLElement): void {
        const items = scope.querySelectorAll<HTMLElement>('[data-copy]');

        for (const item of items) {
            item.addEventListener('click', async (event) => {
                event.stopPropagation();
                const text = item.getAttribute('data-copy');

                if (!text) return;

                const ok = await copyTextToClipboard(text);

                if (ok) {
                    item.classList.add('copied');
                    const originalText = item.innerHTML;
                    item.textContent = COPY_CONFIRMATION_TEXT;

                    setTimeout(() => {
                        item.classList.remove('copied');
                        item.innerHTML = originalText;
                    }, COPIED_FLASH_MS);
                }
            });
        }
    }

    private bindDomTreeHandlers(scope: HTMLElement, target: Element): void {
        const parentNode = scope.querySelector<HTMLElement>('[data-direction="parent"]');

        if (parentNode) {
            parentNode.addEventListener('click', () => {
                const parent = target.parentElement;

                if (parent) {
                    if (this.pinnedElement === target) {
                        this.pinnedElement = parent;
                    } else {
                        this.currentElement = parent;
                    }

                    this.renderBody();
                }
            });
        }

        const childNodes = scope.querySelectorAll<HTMLElement>('[data-direction="child"]');
        const visibleChildren = Array.from(target.children).filter((child) => isElementVisible(child) && !isInsidePixlyUi(child));

        for (const node of childNodes) {
            const indexAttr = node.getAttribute('data-child-index');

            if (!indexAttr) continue;

            const index = parseInt(indexAttr, 10);

            node.addEventListener('click', () => {
                const child = visibleChildren[index];

                if (!child) return;

                if (this.pinnedElement === target) {
                    this.pinnedElement = child;
                } else {
                    this.currentElement = child;
                }

                this.renderBody();
            });
        }
    }

    private escape(value: string): string {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

// Re-export helpers used in spec snippets so other tools can call them.
export { cssColorToHex };
