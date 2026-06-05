// DOM-replacement behaviour for BrokenImagesTool.
//
// jsdom has no box model, so these tests do NOT assert geometry or the CSP
// fallback (which depends on computed pixel widths). They focus on the DOM
// surgery that replaces a broken <img> with an in-flow placeholder and the
// lifecycle around it: relocation, the MutationObserver re-entrancy guard,
// restore-on-disable, and recovery when an image loads successfully.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrokenImagesTool } from './broken-images-tool';
import type { ToolContext } from './tool';
import type { UserSettings } from '@/shared/types/settings';

const PLACEHOLDER_SELECTOR = '[data-pixly-broken-image]';

const STUB_SETTINGS: UserSettings = {
    version: 2,
    palette: [],
    shortcuts: {} as UserSettings['shortcuts'],
    grid: { columns: 12, gutterPx: 16, maxWidthPx: 1200, color: '#ff00ff', opacity: 0.15 },
    magnifier: { sizePx: 180, zoomLevel: 2 },
    measurementUnit: 'px',
    overlay: { opacity: 0.5, blendMode: 'normal' },
    selectedPaletteColor: null,
    snap: { enabled: true, thresholdPx: 5 },
    inspectorPanel: { side: 'right', hideFloatingTooltip: false },
    multiSelection: { maxItems: 10 },
    distanceLine: { color: '#F97316' },
    brokenImages: { backgroundColor: '#E4E4E7', urlMaxChars: 40 },
    showWelcomeMessage: false,
    migrationLog: [],
};

function makeContext(settings: UserSettings = STUB_SETTINGS): ToolContext {
    return {
        get settings() {
            return settings;
        },
        showNotification: vi.fn(),
        onSettingsChange: vi.fn().mockReturnValue(() => undefined),
    };
}

// jsdom ships no IntersectionObserver; the tool only calls observe/unobserve/
// disconnect on it, so a no-op stub is enough.
class StubIntersectionObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
}

// MutationObserver callbacks are delivered on a microtask; a macrotask tick
// guarantees they have all run.
function flushMutations(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
}

function appendImage(parent: Element, src = 'http://example.com/missing.png'): HTMLImageElement {
    const image = document.createElement('img');
    image.setAttribute('src', src);
    parent.appendChild(image);

    return image;
}

describe('BrokenImagesTool — DOM replacement', () => {
    let tool: BrokenImagesTool;

    beforeEach(() => {
        (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
            StubIntersectionObserver;
        document.body.innerHTML = '';
        tool = new BrokenImagesTool();
    });

    afterEach(() => {
        tool.disable();
    });

    it('replaces a broken image with an in-flow placeholder that holds the original image hidden', () => {
        // Arrange
        const parent = document.createElement('div');
        const before = document.createElement('span');
        document.body.appendChild(parent);
        parent.appendChild(before);
        const image = appendImage(parent);

        // Act
        tool.enable(makeContext());
        image.dispatchEvent(new Event('error'));

        // Assert
        const placeholder = parent.querySelector(PLACEHOLDER_SELECTOR);
        expect(placeholder).not.toBeNull();
        expect(placeholder?.previousElementSibling).toBe(before);
        expect(image.parentElement).toBe(placeholder);
        expect(image.style.display).toBe('none');
        const directChildren = Array.from(parent.children);
        expect(directChildren.some((child) => child instanceof HTMLImageElement)).toBe(false);
    });

    it('keeps the placeholder after the MutationObserver processes the relocation', async () => {
        // Arrange
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        const image = appendImage(parent);

        // Act
        tool.enable(makeContext());
        image.dispatchEvent(new Event('error'));
        const placeholder = parent.querySelector(PLACEHOLDER_SELECTOR);
        await flushMutations();

        // Assert — the relocation must not be mistaken for a removal and undone.
        expect(placeholder?.isConnected).toBe(true);
        expect(image.parentElement).toBe(placeholder);
    });

    it('restores the original image to its slot when disabled', () => {
        // Arrange
        const parent = document.createElement('div');
        const before = document.createElement('span');
        document.body.appendChild(parent);
        parent.appendChild(before);
        const image = appendImage(parent);
        tool.enable(makeContext());
        image.dispatchEvent(new Event('error'));
        const placeholder = parent.querySelector(PLACEHOLDER_SELECTOR);

        // Act
        tool.disable();

        // Assert
        expect(placeholder?.isConnected).toBe(false);
        expect(image.parentElement).toBe(parent);
        expect(image.previousElementSibling).toBe(before);
        expect(image.style.display).toBe('');
    });

    it('swaps the real image back when a tracked image recovers', () => {
        // Arrange
        const parent = document.createElement('div');
        document.body.appendChild(parent);
        const image = appendImage(parent);
        tool.enable(makeContext());
        image.dispatchEvent(new Event('error'));
        expect(parent.querySelector(PLACEHOLDER_SELECTOR)).not.toBeNull();

        // Act — emulate a successful reload with real natural dimensions.
        Object.defineProperty(image, 'complete', { value: true, configurable: true });
        Object.defineProperty(image, 'naturalWidth', { value: 120, configurable: true });
        Object.defineProperty(image, 'naturalHeight', { value: 80, configurable: true });
        image.dispatchEvent(new Event('load'));

        // Assert
        expect(parent.querySelector(PLACEHOLDER_SELECTOR)).toBeNull();
        expect(image.parentElement).toBe(parent);
        expect(image.style.display).toBe('');
    });
});
