// DOM-related helpers shared by content-script tools.

import { SHADOW_HOST_ID, PIXLY_INTERACTIVE_ATTR } from '../constants/ui';

export function isElementVisible(element: Element): boolean {
    if (!(element instanceof HTMLElement)) {
        return false;
    }

    const style = getComputedStyle(element);

    if (style.display === 'none' || style.visibility === 'hidden') {
        return false;
    }

    const rect = element.getBoundingClientRect();

    return rect.width > 0 && rect.height > 0;
}

export function isInsidePixlyUi(element: Element | null): boolean {
    if (!element) {
        return false;
    }

    let current: Element | null = element;

    while (current) {
        if (current.id === SHADOW_HOST_ID) {
            return true;
        }

        const root = current.getRootNode();

        if (root instanceof ShadowRoot) {
            return (root.host as HTMLElement)?.id === SHADOW_HOST_ID;
        }

        current = current.parentElement;
    }

    return false;
}

// Returns true only when the element is inside a Pixly interactive surface
// (sidebar, tooltip with buttons, ruler, guide, image overlay, etc.) that
// carries `data-pixly-interactive="true"`.
//
// This is the correct guard for `composedPath()[0]` checks in click handlers.
// `isInsidePixlyUi` is intentionally NOT used for that purpose: when the layer
// has `pointer-events: auto` (as it does when the inspector panel is active),
// every page click produces a composedPath whose first Element is inside the
// shadow DOM — so `isInsidePixlyUi(deepestTarget)` would always return true
// and block every legitimate page click.
export function isInsidePixlyInteractivePanel(element: Element | null): boolean {
    if (!element) {
        return false;
    }

    let current: Element | null = element;

    while (current) {
        if (current instanceof HTMLElement && current.dataset.pixlyInteractive === 'true') {
            return true;
        }

        // Walk up within the current DOM tree first. When parentElement is null
        // we have reached the top of a shadow root or the document — cross the
        // shadow boundary by jumping to the host element.
        if (current.parentElement) {
            current = current.parentElement;
        } else {
            const root = current.getRootNode();

            current = root instanceof ShadowRoot ? root.host : null;
        }
    }

    return false;
}

// Returns a short descriptive selector for an element: tag#id.class1.class2.
export function describeElement(element: Element): string {
    const tag = element.tagName.toLowerCase();
    const id = element.id ? `#${element.id}` : '';
    const MAX_CLASSES_SHOWN = 3;
    const classes = element.classList.length > 0
        ? '.' + Array.from(element.classList).slice(0, MAX_CLASSES_SHOWN).join('.')
        : '';

    return `${tag}${id}${classes}`;
}

// Element under cursor, skipping Pixly UI elements anywhere in the stack.
export function elementUnderPoint(x: number, y: number): Element | null {
    const elements = document.elementsFromPoint(x, y);

    for (const candidate of elements) {
        if (!isInsidePixlyUi(candidate)) {
            return candidate;
        }
    }

    return null;
}

export function clientRectInsideViewport(rect: { width: number; height: number }, x: number, y: number, marginPx: number): { x: number; y: number } {
    const maxX = window.innerWidth - rect.width - marginPx;
    const maxY = window.innerHeight - rect.height - marginPx;

    return {
        x: Math.max(marginPx, Math.min(maxX, x)),
        y: Math.max(marginPx, Math.min(maxY, y)),
    };
}

interface AnchorEdges {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

// Position a floating panel diagonally off a corner of the anchor element so it
// never overlaps the element's box — nor the spacing badges that hug its edges,
// since the panel is offset on BOTH axes beyond an edge plus a gap. The
// bottom-right quadrant is preferred; each axis independently flips to the
// opposite side when there is not enough room before the viewport margin. A
// final clamp keeps the panel fully on-screen for elements larger than the
// available space.
export function computeDiagonalTooltipPosition(
    anchor: AnchorEdges,
    tooltipSize: { width: number; height: number },
    viewport: { width: number; height: number },
    gapPx: number,
    marginPx: number,
): { x: number; y: number } {
    const fitsRight = anchor.right + gapPx + tooltipSize.width + marginPx <= viewport.width;
    const fitsBelow = anchor.bottom + gapPx + tooltipSize.height + marginPx <= viewport.height;

    const desiredX = fitsRight ? anchor.right + gapPx : anchor.left - gapPx - tooltipSize.width;
    const desiredY = fitsBelow ? anchor.bottom + gapPx : anchor.top - gapPx - tooltipSize.height;

    const maxX = viewport.width - tooltipSize.width - marginPx;
    const maxY = viewport.height - tooltipSize.height - marginPx;

    return {
        x: Math.max(marginPx, Math.min(maxX, desiredX)),
        y: Math.max(marginPx, Math.min(maxY, desiredY)),
    };
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);

        return true;
    } catch {
        return false;
    }
}
