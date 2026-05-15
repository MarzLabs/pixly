// Multi-selection state: tracks the elements selected via Shift+click and the
// derived metrics (bounding box, consecutive-pair distances). Lives outside
// any single tool so the inspector panel and the inspector tool can share it.

import { ColorToken } from '@/shared/constants/design-tokens';
import { rectDistances, rectFromDomRect, type Rect } from '@/shared/utils/measurements';
import { describeElement } from '@/shared/utils/dom';
import { ensureShadowMount } from '../shadow-host';

export interface SelectionPairDistance {
    fromIndex: number;
    toIndex: number;
    horizontal: number;
    vertical: number;
    diagonal: number;
}

export interface SelectionSummary {
    elements: Element[];
    boundingBox: Rect | null;
    pairs: SelectionPairDistance[];
}

export type SelectionChangeHandler = (summary: SelectionSummary) => void;

interface SelectionEntry {
    element: Element;
    highlight: HTMLDivElement;
}

const MIN_PAIR_DISTANCE_PX = 0;
const BOUNDING_BOX_INSET_PX = 0;

export class SelectionManager {
    private readonly entries: SelectionEntry[] = [];
    private boundingBoxElement: HTMLDivElement | null = null;
    private maxItems = 10;
    private readonly listeners = new Set<SelectionChangeHandler>();

    setMaxItems(max: number): void {
        this.maxItems = max;
    }

    onChange(handler: SelectionChangeHandler): () => void {
        this.listeners.add(handler);
        // Emit the current state immediately so subscribers can render their
        // initial view without waiting for a change.
        handler(this.computeSummary());

        return () => this.listeners.delete(handler);
    }

    // Returns one of: 'added', 'removed', 'limit-reached', 'noop'.
    toggle(element: Element): 'added' | 'removed' | 'limit-reached' {
        const existingIndex = this.entries.findIndex((entry) => entry.element === element);

        if (existingIndex >= 0) {
            const [removed] = this.entries.splice(existingIndex, 1);
            removed.highlight.remove();
            this.notify();

            return 'removed';
        }

        if (this.entries.length >= this.maxItems) {
            return 'limit-reached';
        }

        const highlight = this.createHighlight(element);
        this.entries.push({ element, highlight });
        this.notify();

        return 'added';
    }

    clear(): void {
        for (const entry of this.entries) {
            entry.highlight.remove();
        }

        this.entries.length = 0;
        this.boundingBoxElement?.remove();
        this.boundingBoxElement = null;
        this.notify();
    }

    refreshHighlights(): void {
        for (const entry of this.entries) {
            this.positionHighlight(entry);
        }

        this.repositionBoundingBox();
    }

    isEmpty(): boolean {
        return this.entries.length === 0;
    }

    listElements(): readonly Element[] {
        return this.entries.map((entry) => entry.element);
    }

    // Detect whether `child` is a descendant of any already-selected element
    // (or vice versa). Used to warn about parent-child relationships.
    hasContainmentWith(element: Element): boolean {
        for (const entry of this.entries) {
            if (entry.element === element) continue;

            if (entry.element.contains(element) || element.contains(entry.element)) {
                return true;
            }
        }

        return false;
    }

    computeSummary(): SelectionSummary {
        const elements = this.entries.map((entry) => entry.element);

        if (elements.length === 0) {
            return { elements, boundingBox: null, pairs: [] };
        }

        const rects = elements.map((element) => rectFromDomRect(element.getBoundingClientRect()));
        const boundingBox = this.computeBoundingBox(rects);
        const pairs: SelectionPairDistance[] = [];

        for (let index = 0; index < rects.length - 1; index += 1) {
            const distances = rectDistances(rects[index], rects[index + 1]);
            pairs.push({
                fromIndex: index,
                toIndex: index + 1,
                horizontal: Math.max(MIN_PAIR_DISTANCE_PX, distances.horizontal),
                vertical: Math.max(MIN_PAIR_DISTANCE_PX, distances.vertical),
                diagonal: distances.diagonal,
            });
        }

        return { elements, boundingBox, pairs };
    }

    formatSummaryAsText(summary: SelectionSummary): string {
        if (summary.elements.length === 0) {
            return '';
        }

        const lines = summary.elements.map((element, index) => `${index + 1}. ${describeElement(element)}`);

        if (summary.boundingBox) {
            lines.push('');
            lines.push(`Bounding box: ${Math.round(summary.boundingBox.width)}px × ${Math.round(summary.boundingBox.height)}px`);
        }

        if (summary.pairs.length > 0) {
            lines.push('');
            lines.push('Distancias entre pares consecutivos:');

            for (const pair of summary.pairs) {
                lines.push(`${pair.fromIndex + 1} → ${pair.toIndex + 1}: H ${Math.round(pair.horizontal)}px · V ${Math.round(pair.vertical)}px · D ${Math.round(pair.diagonal)}px`);
            }
        }

        return lines.join('\n');
    }

    // ---------- Internal helpers ----------

    private createHighlight(element: Element): HTMLDivElement {
        const { layer } = ensureShadowMount();
        const node = document.createElement('div');
        node.className = 'pixly-multi-highlight';
        layer.appendChild(node);

        const entry: SelectionEntry = { element, highlight: node };
        this.positionHighlight(entry);

        return node;
    }

    private positionHighlight(entry: SelectionEntry): void {
        const rect = entry.element.getBoundingClientRect();
        entry.highlight.style.left = `${rect.left}px`;
        entry.highlight.style.top = `${rect.top}px`;
        entry.highlight.style.width = `${rect.width}px`;
        entry.highlight.style.height = `${rect.height}px`;
    }

    private notify(): void {
        const summary = this.computeSummary();
        this.refreshBoundingBox(summary.boundingBox);

        for (const listener of this.listeners) {
            listener(summary);
        }
    }

    private refreshBoundingBox(boundingBox: Rect | null): void {
        if (!boundingBox || this.entries.length < 2) {
            this.boundingBoxElement?.remove();
            this.boundingBoxElement = null;

            return;
        }

        const { layer } = ensureShadowMount();

        if (!this.boundingBoxElement) {
            this.boundingBoxElement = document.createElement('div');
            this.boundingBoxElement.className = 'pixly-multi-bbox';
            this.boundingBoxElement.style.outlineColor = ColorToken.Accent;
            layer.appendChild(this.boundingBoxElement);
        }

        this.boundingBoxElement.style.left = `${boundingBox.left - BOUNDING_BOX_INSET_PX}px`;
        this.boundingBoxElement.style.top = `${boundingBox.top - BOUNDING_BOX_INSET_PX}px`;
        this.boundingBoxElement.style.width = `${boundingBox.width + BOUNDING_BOX_INSET_PX * 2}px`;
        this.boundingBoxElement.style.height = `${boundingBox.height + BOUNDING_BOX_INSET_PX * 2}px`;
    }

    private repositionBoundingBox(): void {
        const summary = this.computeSummary();
        this.refreshBoundingBox(summary.boundingBox);
    }

    private computeBoundingBox(rects: Rect[]): Rect | null {
        if (rects.length === 0) {
            return null;
        }

        const left = Math.min(...rects.map((rect) => rect.left));
        const top = Math.min(...rects.map((rect) => rect.top));
        const right = Math.max(...rects.map((rect) => rect.right));
        const bottom = Math.max(...rects.map((rect) => rect.bottom));

        return {
            left,
            top,
            right,
            bottom,
            width: right - left,
            height: bottom - top,
        };
    }
}

let sharedSelection: SelectionManager | null = null;

export function getSelectionManager(): SelectionManager {
    if (!sharedSelection) {
        sharedSelection = new SelectionManager();
    }

    return sharedSelection;
}
