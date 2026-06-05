import { beforeEach, describe, expect, it, vi } from 'vitest';
import { clientRectInsideViewport, computeDiagonalTooltipPosition, describeElement, elementUnderPoint, isInsidePixlyInteractivePanel } from './dom';
import { SHADOW_HOST_ID, PIXLY_INTERACTIVE_ATTR } from '../constants/ui';

describe('describeElement', () => {
    it('returns a tag selector with id and up to three classes', () => {
        // Arrange
        const div = document.createElement('div');
        div.id = 'card';
        div.classList.add('a', 'b', 'c', 'd');

        // Act
        const selector = describeElement(div);

        // Assert
        expect(selector).toBe('div#card.a.b.c');
    });

    it('omits id and classes when missing', () => {
        // Arrange
        const span = document.createElement('span');

        // Act / Assert
        expect(describeElement(span)).toBe('span');
    });
});

describe('elementUnderPoint', () => {
    /** Build a minimal Pixly shadow host element and attach it to document.body. */
    function buildPixlyHost(): HTMLElement {
        const host = document.createElement('div');
        host.id = SHADOW_HOST_ID;
        document.body.appendChild(host);

        return host;
    }

    /** Stub document.elementsFromPoint to return a controlled stack.
     *  jsdom does not implement this method, so we assign it directly. */
    function stubElementsFromPoint(stack: Element[]): void {
        document.elementsFromPoint = vi.fn().mockReturnValue(stack);
    }

    beforeEach(() => {
        vi.restoreAllMocks();
        document.body.innerHTML = '';
    });

    it('returns null when no elements are under the point', () => {
        // Arrange
        stubElementsFromPoint([]);

        // Act
        const result = elementUnderPoint(100, 100);

        // Assert
        expect(result).toBeNull();
    });

    it('skips Pixly UI elements and returns the page element behind them', () => {
        // Arrange
        const host = buildPixlyHost();
        const sidebarButton = document.createElement('button');
        host.appendChild(sidebarButton);

        const pageDiv = document.createElement('div');
        document.body.appendChild(pageDiv);

        // Topmost is inside Pixly shadow host — page element is behind it.
        stubElementsFromPoint([sidebarButton, host, pageDiv, document.body]);

        // Act
        const result = elementUnderPoint(50, 50);

        // Assert — must skip Pixly elements and return the first page element
        expect(result).toBe(pageDiv);
    });

    it('returns the page element when the topmost element is not Pixly UI', () => {
        // Arrange
        const pageDiv = document.createElement('div');
        document.body.appendChild(pageDiv);

        stubElementsFromPoint([pageDiv, document.body]);

        // Act
        const result = elementUnderPoint(200, 200);

        // Assert
        expect(result).toBe(pageDiv);
    });

    it('skips Pixly overlays lower in the stack when topmost is page content', () => {
        // Arrange
        const host = buildPixlyHost();
        const overlay = document.createElement('span');
        host.appendChild(overlay);

        const pageLink = document.createElement('a');
        document.body.appendChild(pageLink);

        // Topmost is a page element; a Pixly overlay appears lower in the stack.
        stubElementsFromPoint([pageLink, overlay, host, document.body]);

        // Act
        const result = elementUnderPoint(300, 300);

        // Assert — first non-Pixly element in the stack is returned
        expect(result).toBe(pageLink);
    });
});

describe('isInsidePixlyInteractivePanel', () => {
    it('returns false for null', () => {
        // Arrange / Act / Assert
        expect(isInsidePixlyInteractivePanel(null)).toBe(false);
    });

    it('returns false for a plain page element without the attribute', () => {
        // Arrange
        const div = document.createElement('div');

        // Act / Assert
        expect(isInsidePixlyInteractivePanel(div)).toBe(false);
    });

    it('returns true when the element itself carries data-pixly-interactive', () => {
        // Arrange
        const panel = document.createElement('div');
        panel.setAttribute(PIXLY_INTERACTIVE_ATTR, 'true');

        // Act / Assert
        expect(isInsidePixlyInteractivePanel(panel)).toBe(true);
    });

    it('returns true when an ancestor carries data-pixly-interactive', () => {
        // Arrange
        const panel = document.createElement('div');
        panel.setAttribute(PIXLY_INTERACTIVE_ATTR, 'true');
        const button = document.createElement('button');
        panel.appendChild(button);

        // Act / Assert — descendant must detect the ancestor's attribute
        expect(isInsidePixlyInteractivePanel(button)).toBe(true);
    });

    // Regression: clicking the transparent .pixly-layer (shadow DOM element
    // without the interactive attribute) must NOT be treated as an interactive
    // panel click, so the click-to-pin handler proceeds to inspect the page
    // element under the cursor. This is the root cause of the original bug:
    // isInsidePixlyUi was used instead, which returned true for every click
    // when the layer had pointer-events:auto, blocking all pin interactions.
    it('returns false for a shadow DOM element that lacks the attribute', () => {
        // Arrange — simulate the .pixly-layer transparent overlay inside shadow DOM
        const host = document.createElement('div');
        host.id = SHADOW_HOST_ID;
        const shadow = host.attachShadow({ mode: 'open' });
        const layer = document.createElement('div');
        layer.className = 'pixly-layer';
        shadow.appendChild(layer);

        // Act / Assert — the layer has no data-pixly-interactive, so it must NOT block
        expect(isInsidePixlyInteractivePanel(layer)).toBe(false);
    });

    it('returns true for a shadow DOM element whose host carries the attribute', () => {
        // Arrange — simulate a panel inside shadow DOM with the attribute on its container
        const host = document.createElement('div');
        host.id = SHADOW_HOST_ID;
        const shadow = host.attachShadow({ mode: 'open' });
        const panel = document.createElement('div');
        panel.setAttribute(PIXLY_INTERACTIVE_ATTR, 'true');
        shadow.appendChild(panel);
        const button = document.createElement('button');
        panel.appendChild(button);

        // Act / Assert — button inside marked panel should return true
        expect(isInsidePixlyInteractivePanel(button)).toBe(true);
    });
});

describe('clientRectInsideViewport', () => {
    it('keeps coordinates inside the viewport margins', () => {
        // Arrange
        Object.defineProperty(window, 'innerWidth', { value: 1000, configurable: true });
        Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });

        // Act
        const tooFar = clientRectInsideViewport({ width: 200, height: 100 }, 9999, 9999, 16);
        const tooClose = clientRectInsideViewport({ width: 200, height: 100 }, -50, -50, 16);

        // Assert
        expect(tooFar).toEqual({ x: 1000 - 200 - 16, y: 800 - 100 - 16 });
        expect(tooClose).toEqual({ x: 16, y: 16 });
    });
});

describe('computeDiagonalTooltipPosition', () => {
    const VIEWPORT = { width: 1000, height: 800 };
    const TOOLTIP = { width: 200, height: 100 };
    const GAP = 8;
    const MARGIN = 8;

    it('places the tooltip diagonally off the bottom-right corner by default', () => {
        // Arrange — small element with room on every side.
        const anchor = { top: 200, right: 300, bottom: 240, left: 100 };

        // Act
        const position = computeDiagonalTooltipPosition(anchor, TOOLTIP, VIEWPORT, GAP, MARGIN);

        // Assert — offset beyond the right and bottom edges plus the gap.
        expect(position).toEqual({ x: 300 + GAP, y: 240 + GAP });
    });

    it('flips to the left when there is not enough room on the right', () => {
        // Arrange — element hugging the right edge of the viewport.
        const anchor = { top: 200, right: 980, bottom: 240, left: 850 };

        // Act
        const position = computeDiagonalTooltipPosition(anchor, TOOLTIP, VIEWPORT, GAP, MARGIN);

        // Assert — tooltip sits to the left of the element, still below it.
        expect(position).toEqual({ x: 850 - GAP - TOOLTIP.width, y: 240 + GAP });
    });

    it('flips above when there is not enough room below', () => {
        // Arrange — element near the bottom of the viewport.
        const anchor = { top: 720, right: 300, bottom: 760, left: 100 };

        // Act
        const position = computeDiagonalTooltipPosition(anchor, TOOLTIP, VIEWPORT, GAP, MARGIN);

        // Assert — tooltip sits above the element, still to its right.
        expect(position).toEqual({ x: 300 + GAP, y: 720 - GAP - TOOLTIP.height });
    });

    it('clamps to the viewport margins for an element wider than the available space', () => {
        // Arrange — element so wide that both horizontal sides overflow.
        const anchor = { top: 100, right: 999, bottom: 140, left: 1 };

        // Act
        const position = computeDiagonalTooltipPosition(anchor, TOOLTIP, VIEWPORT, GAP, MARGIN);

        // Assert — left flip would land off-screen, so it clamps to the margin.
        expect(position.x).toBe(MARGIN);
        expect(position.y).toBe(140 + GAP);
    });
});
