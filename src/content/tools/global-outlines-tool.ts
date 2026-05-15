// Global outlines: paints a thin outline on every visible element so block
// boundaries are immediately visible. The outline lives in a single <style>
// element so it can be applied and removed atomically without mutating DOM nodes.

import { ensureShadowMount } from '../shadow-host';
import type { Tool, ToolContext } from './tool';

const STYLE_ELEMENT_ID = 'pixly-global-outlines-style';
const OUTLINE_COLOR = 'rgba(79, 70, 229, 0.5)';
const OUTLINE_WIDTH_PX = 1;
const DEFAULT_TAGS = ['div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'span', 'a', 'button', 'img', 'input', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

export class GlobalOutlinesTool implements Tool {
    private styleElement: HTMLStyleElement | null = null;
    private tagFilter: string[] = DEFAULT_TAGS;

    enable(_context: ToolContext): void {
        this.styleElement = document.createElement('style');
        this.styleElement.id = STYLE_ELEMENT_ID;
        document.head.appendChild(this.styleElement);
        this.applyOutlines(this.tagFilter);

        // Ensure Shadow DOM is mounted so other notifications work even when
        // only this tool is active.
        ensureShadowMount();
    }

    disable(): void {
        this.styleElement?.remove();
        this.styleElement = null;
    }

    setFilter(tags: string[]): void {
        this.tagFilter = tags.length > 0 ? tags : DEFAULT_TAGS;
        this.applyOutlines(this.tagFilter);
    }

    private applyOutlines(tags: string[]): void {
        if (!this.styleElement) {
            return;
        }

        const selector = tags
            .map((tag) => `${tag}:not([data-pixly])`)
            .join(', ');

        this.styleElement.textContent = `${selector} { outline: ${OUTLINE_WIDTH_PX}px solid ${OUTLINE_COLOR} !important; outline-offset: 0 !important; }`;
    }
}
