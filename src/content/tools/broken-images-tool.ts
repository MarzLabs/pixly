// Fix broken images: replaces every <img> that has failed to load with a
// neutral, in-flow placeholder so designers and engineers can audit page
// layout when image hosts are misconfigured.
//
// Strategy notes:
// - Inline styles only. Avoids injecting a <style> tag so the tool keeps
//   working on pages with a strict style-src CSP.
// - DOM replacement (not a floating overlay): the broken <img> is swapped for
//   a placeholder <div> that takes its place in normal flow. The original
//   <img> is kept *hidden inside* the placeholder so it stays connected to the
//   document — recovery detection (load/error events, src mutations) keeps
//   working — and so disabling the tool is a clean swap back to the original.
// - Because the placeholder lives in normal flow, it scrolls natively with the
//   page. The previous position:fixed overlay had to be repositioned every
//   frame on scroll, which lagged behind the native scroll and produced a
//   visible ghosting effect. There is no per-frame repositioning anymore.
// - Off-screen images are evaluated lazily via IntersectionObserver to keep
//   activation fast on large galleries.
// - MutationObserver watches the document for added/removed <img> elements and
//   for `src` changes so we re-evaluate when the page reassigns the source.

import {
    BROKEN_IMAGES_DEFAULTS,
    FontStack,
    FontSize,
    FontWeight,
    ColorToken,
} from '@/shared/constants';
import {
    decidePlaceholderSize,
    evaluateImage,
    truncateUrl,
    type ImageProbe,
} from '@/shared/utils/broken-images';
import type { UserSettings } from '@/shared/types/settings';
import type { Tool, ToolContext } from './tool';

const PLACEHOLDER_DATASET_FLAG = 'pixlyBrokenImagesOverlay';
const PLACEHOLDER_DATA_ATTR = 'data-pixly-broken-image';
const PLACEHOLDER_SELECTOR = `[${PLACEHOLDER_DATA_ATTR}]`;
const TRACKED_IMAGE_FLAG = 'pixlyBrokenImageTracked';
const ALIGNMENT_PROBE_PIXELS = 1;
const HIDDEN_DISPLAY = 'none';
const CSP_FALLBACK_MESSAGE = 'Fix broken images could not apply placeholders on this page (CSP restriction).';

// Outer display values that establish a block-level box. Anything else (inline,
// inline-block, …) is treated as inline so the placeholder keeps the original
// image's inline-vs-block flow behavior.
const BLOCK_LEVEL_DISPLAYS = new Set(['block', 'flex', 'grid', 'list-item', 'table']);

interface TrackedImage {
    image: HTMLImageElement;
    placeholder: HTMLDivElement;
    labelContainer: HTMLDivElement;
    // The image's own inline `display` before we hid it, restored on untrack.
    previousInlineDisplay: string;
}

export class BrokenImagesTool implements Tool {
    private context: ToolContext | null = null;
    private settings: UserSettings | null = null;
    private settingsUnsubscribe: (() => void) | null = null;

    private readonly tracked = new Map<HTMLImageElement, TrackedImage>();
    private readonly erroredImages = new WeakSet<HTMLImageElement>();
    private readonly pendingImages = new Set<HTMLImageElement>();

    private intersectionObserver: IntersectionObserver | null = null;
    private mutationObserver: MutationObserver | null = null;
    private cspFallbackNotified = false;

    enable(context: ToolContext): void {
        this.context = context;
        this.settings = context.settings;
        this.settingsUnsubscribe = context.onSettingsChange((settings) => this.onSettingsChange(settings));

        this.installObservers();
        this.scanAllImages();
    }

    disable(): void {
        this.settingsUnsubscribe?.();
        this.settingsUnsubscribe = null;

        this.intersectionObserver?.disconnect();
        this.intersectionObserver = null;
        this.mutationObserver?.disconnect();
        this.mutationObserver = null;

        for (const tracked of this.tracked.values()) {
            this.detachTrackedImage(tracked);
        }

        this.tracked.clear();
        this.pendingImages.clear();
        this.context = null;
        this.settings = null;
        this.cspFallbackNotified = false;
    }

    onSettingsChange(settings: UserSettings): void {
        this.settings = settings;

        for (const tracked of this.tracked.values()) {
            this.renderPlaceholder(tracked);
        }
    }

    // ---------- Observers and event wiring ----------

    private installObservers(): void {
        this.intersectionObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (!(entry.target instanceof HTMLImageElement)) {
                    continue;
                }

                if (entry.isIntersecting) {
                    this.evaluateImage(entry.target);
                }
            }
        });

        this.mutationObserver = new MutationObserver((mutations) => this.onMutations(mutations));
        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src'],
        });
    }

    private onMutations(mutations: MutationRecord[]): void {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of Array.from(mutation.addedNodes)) {
                    this.queueAddedNode(node);
                }

                for (const node of Array.from(mutation.removedNodes)) {
                    this.queueRemovedNode(node);
                }
            } else if (
                mutation.type === 'attributes' &&
                mutation.attributeName === 'src' &&
                mutation.target instanceof HTMLImageElement
            ) {
                // Image source changed: clear cached error state so the new
                // load is re-evaluated from scratch.
                this.erroredImages.delete(mutation.target);
                this.evaluateImage(mutation.target);
            }
        }
    }

    private queueAddedNode(node: Node): void {
        if (node instanceof HTMLImageElement) {
            this.evaluateImage(node);

            return;
        }

        if (!(node instanceof Element)) {
            return;
        }

        // The added node may be a subtree containing <img> elements.
        const images = node.querySelectorAll<HTMLImageElement>('img');

        for (const image of Array.from(images)) {
            this.evaluateImage(image);
        }
    }

    private queueRemovedNode(node: Node): void {
        if (node instanceof HTMLImageElement) {
            // A tracked image is re-homed into its placeholder, which the
            // observer reports as a removal from the original parent. It is
            // still connected, so ignore it — only act on a genuine detach.
            if (node.isConnected) {
                return;
            }

            this.untrackImage(node);

            return;
        }

        if (!(node instanceof Element)) {
            return;
        }

        for (const tracked of Array.from(this.tracked.keys())) {
            if (node.contains(tracked)) {
                this.untrackImage(tracked);
            }
        }
    }

    // ---------- Image lifecycle ----------

    private scanAllImages(): void {
        const images = document.querySelectorAll<HTMLImageElement>('img');
        const limit = Math.min(images.length, BROKEN_IMAGES_DEFAULTS.maxObservedImages);

        for (let index = 0; index < limit; index += 1) {
            this.evaluateImage(images[index]!);
        }
    }

    private evaluateImage(image: HTMLImageElement): void {
        // Skip our own hidden <img> nested inside a placeholder. Mutation and
        // intersection callbacks can surface it, but it is not a fresh
        // candidate — its lifecycle is driven by its load/error listeners.
        if (image.closest(PLACEHOLDER_SELECTOR)) {
            return;
        }

        if (!this.isImageVisible(image)) {
            this.untrackImage(image);

            return;
        }

        // Wire one-shot listeners so we can react when the image resolves.
        // The tracked flag avoids piling up duplicate listeners across
        // mutation/intersection callbacks for the same element.
        if (!image.dataset[TRACKED_IMAGE_FLAG]) {
            image.dataset[TRACKED_IMAGE_FLAG] = 'true';
            image.addEventListener('error', () => this.handleImageError(image));
            image.addEventListener('load', () => this.handleImageLoad(image));
        }

        const evaluation = evaluateImage(this.buildProbe(image));

        if (evaluation.reason === 'still-loading') {
            this.pendingImages.add(image);
            this.observeForIntersection(image);

            return;
        }

        this.pendingImages.delete(image);

        if (evaluation.isBroken) {
            this.trackBrokenImage(image);

            return;
        }

        this.untrackImage(image);
        this.observeForIntersection(image);
    }

    private observeForIntersection(image: HTMLImageElement): void {
        this.intersectionObserver?.observe(image);
    }

    private buildProbe(image: HTMLImageElement): ImageProbe {
        return {
            complete: image.complete,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
            hasErrored: this.erroredImages.has(image),
            src: image.getAttribute('src'),
        };
    }

    private handleImageError(image: HTMLImageElement): void {
        this.erroredImages.add(image);

        if (this.tracked.has(image)) {
            // Already shown as broken; nothing changes.
            return;
        }

        this.evaluateImage(image);
    }

    private handleImageLoad(image: HTMLImageElement): void {
        this.erroredImages.delete(image);

        // A tracked image that now loads cleanly has recovered: probe it
        // directly (it lives hidden inside the placeholder, so the visibility
        // guard in evaluateImage would otherwise short-circuit) and swap the
        // real image back in.
        if (this.tracked.has(image)) {
            const evaluation = evaluateImage(this.buildProbe(image));

            if (!evaluation.isBroken) {
                this.untrackImage(image);
            }

            return;
        }

        this.evaluateImage(image);
    }

    private isImageVisible(image: HTMLImageElement): boolean {
        if (!image.isConnected) {
            return false;
        }

        const style = window.getComputedStyle(image);

        if (style.display === 'none' || style.visibility === 'hidden') {
            return false;
        }

        return true;
    }

    private trackBrokenImage(image: HTMLImageElement): void {
        const existing = this.tracked.get(image);

        if (existing) {
            this.renderPlaceholder(existing);

            return;
        }

        // Measure the image's box and resolve flow-relevant styles *before*
        // mutating the DOM, while the image still occupies its natural slot.
        const computed = window.getComputedStyle(image);
        const rect = image.getBoundingClientRect();
        const isBlockLevel = BLOCK_LEVEL_DISPLAYS.has(computed.display);

        const placeholder = document.createElement('div');
        placeholder.setAttribute(PLACEHOLDER_DATA_ATTR, '');
        placeholder.dataset[PLACEHOLDER_DATASET_FLAG] = 'true';

        const labelContainer = document.createElement('div');

        // Swap the placeholder into the image's slot, then re-home the image
        // (now hidden) inside it. The image stays connected to the document so
        // its load/error listeners and src mutations keep flowing.
        const previousInlineDisplay = image.style.display;
        image.replaceWith(placeholder);
        image.style.display = HIDDEN_DISPLAY;
        placeholder.appendChild(image);
        placeholder.appendChild(labelContainer);

        const tracked: TrackedImage = {
            image,
            placeholder,
            labelContainer,
            previousInlineDisplay,
        };

        this.applyPlaceholderLayout(placeholder, computed, rect, isBlockLevel);
        this.tracked.set(image, tracked);
        this.intersectionObserver?.unobserve(image);
        this.renderPlaceholder(tracked);
        this.detectCspBlocking(placeholder);
    }

    private untrackImage(image: HTMLImageElement): void {
        const tracked = this.tracked.get(image);

        if (!tracked) {
            return;
        }

        this.detachTrackedImage(tracked);
        this.tracked.delete(image);
    }

    // Restore the original image to its slot and discard the placeholder. The
    // image is currently a child of the placeholder, so replacing the
    // placeholder with the image moves it back into the document flow.
    private detachTrackedImage(tracked: TrackedImage): void {
        this.intersectionObserver?.unobserve(tracked.image);
        tracked.image.style.display = tracked.previousInlineDisplay;

        if (tracked.placeholder.isConnected) {
            tracked.placeholder.replaceWith(tracked.image);
        } else {
            tracked.placeholder.remove();
        }
    }

    // ---------- Rendering ----------

    // Size the placeholder and reproduce the image's flow-affecting box so the
    // surrounding layout does not shift when we swap the element.
    private applyPlaceholderLayout(
        placeholder: HTMLDivElement,
        computed: CSSStyleDeclaration,
        rect: DOMRect,
        isBlockLevel: boolean,
    ): void {
        const size = decidePlaceholderSize(rect.width, rect.height);

        placeholder.style.boxSizing = 'border-box';
        placeholder.style.width = `${String(size.width)}px`;
        placeholder.style.height = `${String(size.height)}px`;
        placeholder.style.maxWidth = '100%';

        // flex / inline-flex preserves the original block-vs-inline flow level
        // while letting us center the label inside the box.
        placeholder.style.display = isBlockLevel ? 'flex' : 'inline-flex';
        placeholder.style.flexDirection = 'column';
        placeholder.style.alignItems = 'center';
        placeholder.style.justifyContent = 'center';
        placeholder.style.gap = '2px';
        placeholder.style.overflow = 'hidden';
        placeholder.style.textAlign = 'center';
        placeholder.style.padding = '4px 8px';
        placeholder.style.color = ColorToken.Gray600;
        placeholder.style.font = `${FontWeight.Medium} ${FontSize.Sm}/1.3 ${FontStack.Sans}`;

        // Copy the flow-relevant box properties so neighbors keep their spacing.
        placeholder.style.marginTop = computed.marginTop;
        placeholder.style.marginRight = computed.marginRight;
        placeholder.style.marginBottom = computed.marginBottom;
        placeholder.style.marginLeft = computed.marginLeft;
        placeholder.style.verticalAlign = computed.verticalAlign;
        placeholder.style.borderRadius = computed.borderRadius;
        placeholder.style.boxShadow = computed.boxShadow;
        placeholder.style.clipPath = computed.clipPath;
    }

    private renderPlaceholder(tracked: TrackedImage): void {
        if (!this.settings) {
            return;
        }

        const config = this.settings.brokenImages;
        const rect = tracked.placeholder.getBoundingClientRect();
        const size = decidePlaceholderSize(rect.width, rect.height);
        const rawSrc = tracked.image.getAttribute('src') ?? '';
        const truncated = rawSrc.length === 0 ? '(no src)' : truncateUrl(rawSrc, config.urlMaxChars);
        const dimensionsLabel = `${String(size.width)}×${String(size.height)}`;

        tracked.placeholder.style.background = config.backgroundColor;
        tracked.placeholder.style.border = `1px solid ${ColorToken.Gray300}`;
        tracked.placeholder.title = `${dimensionsLabel} · ${rawSrc || '(no src)'}`;

        tracked.labelContainer.innerHTML = '';

        if (!size.showLabel) {
            return;
        }

        tracked.labelContainer.style.display = 'flex';
        tracked.labelContainer.style.flexDirection = 'column';
        tracked.labelContainer.style.alignItems = 'center';
        tracked.labelContainer.style.gap = '2px';
        tracked.labelContainer.style.maxWidth = '100%';
        tracked.labelContainer.style.overflow = 'hidden';

        const dimensions = document.createElement('span');
        dimensions.textContent = dimensionsLabel;
        dimensions.style.fontWeight = String(FontWeight.Semibold);
        dimensions.style.color = ColorToken.Gray700;

        const url = document.createElement('span');
        url.textContent = truncated;
        url.style.fontSize = FontSize.Xs;
        url.style.color = ColorToken.Gray500;
        url.style.maxWidth = '100%';
        url.style.overflow = 'hidden';
        url.style.textOverflow = 'ellipsis';
        url.style.whiteSpace = 'nowrap';
        url.style.padding = '0 4px';

        tracked.labelContainer.appendChild(dimensions);
        tracked.labelContainer.appendChild(url);
    }

    // ---------- CSP fallback ----------

    // If a strict CSP (style-src) strips our inline styles, the placeholder
    // will render at 0×0 even after we wrote width/height. We detect that
    // once and surface a single notification to the user — subsequent
    // placeholders stay silent so we never spam the page.
    private detectCspBlocking(placeholder: HTMLDivElement): void {
        if (this.cspFallbackNotified || !this.context) {
            return;
        }

        // Defer until the browser has had a chance to apply the inline styles.
        requestAnimationFrame(() => {
            if (this.cspFallbackNotified) {
                return;
            }

            const computed = window.getComputedStyle(placeholder);
            const widthPx = parseFloat(computed.width);

            if (Number.isFinite(widthPx) && widthPx >= ALIGNMENT_PROBE_PIXELS) {
                return;
            }

            this.cspFallbackNotified = true;
            this.context?.showNotification(CSP_FALLBACK_MESSAGE);
        });
    }
}
