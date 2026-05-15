// Fix broken images: overlays a neutral placeholder on every <img> that has
// failed to load so designers and engineers can audit page layout when image
// hosts are misconfigured.
//
// Strategy notes:
// - Inline styles only. Avoids injecting a <style> tag so the tool keeps
//   working on pages with a strict style-src CSP.
// - One sibling <div> per broken <img>, positioned via `position: fixed` and
//   the image's bounding rect. We never mutate the <img> element, so disabling
//   the tool is a clean removal of the sibling nodes.
// - Off-screen images are evaluated lazily via IntersectionObserver to keep
//   activation fast on large galleries.
// - MutationObserver watches the document for added/removed <img> elements
//   *and* for `style`/`src` attribute changes so we re-evaluate when the page
//   reassigns either of them.
// - ResizeObserver tracks layout shifts on each tracked image so the overlay
//   stays aligned without polling.

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
const TRACKED_IMAGE_FLAG = 'pixlyBrokenImageTracked';
const PLACEHOLDER_Z_INDEX = '2147483600';
const ALIGNMENT_PROBE_PIXELS = 1;
const CSP_FALLBACK_MESSAGE = 'Fix broken images could not apply placeholders on this page (CSP restriction).';

interface TrackedImage {
    image: HTMLImageElement;
    placeholder: HTMLDivElement;
    onError: () => void;
    onLoad: () => void;
}

export class BrokenImagesTool implements Tool {
    private context: ToolContext | null = null;
    private settings: UserSettings | null = null;
    private settingsUnsubscribe: (() => void) | null = null;

    private readonly tracked = new Map<HTMLImageElement, TrackedImage>();
    private readonly erroredImages = new WeakSet<HTMLImageElement>();
    private readonly pendingImages = new Set<HTMLImageElement>();

    private intersectionObserver: IntersectionObserver | null = null;
    private resizeObserver: ResizeObserver | null = null;
    private mutationObserver: MutationObserver | null = null;
    private scrollHandler: (() => void) | null = null;
    private resizeHandler: (() => void) | null = null;
    private repositionFrame: number | null = null;
    private cspFallbackNotified = false;

    enable(context: ToolContext): void {
        this.context = context;
        this.settings = context.settings;
        this.settingsUnsubscribe = context.onSettingsChange((settings) => this.onSettingsChange(settings));

        this.installObservers();
        this.scanAllImages();
        this.bindWindowEvents();
    }

    disable(): void {
        this.settingsUnsubscribe?.();
        this.settingsUnsubscribe = null;

        this.intersectionObserver?.disconnect();
        this.intersectionObserver = null;
        this.resizeObserver?.disconnect();
        this.resizeObserver = null;
        this.mutationObserver?.disconnect();
        this.mutationObserver = null;

        if (this.scrollHandler) {
            window.removeEventListener('scroll', this.scrollHandler, true);
            this.scrollHandler = null;
        }

        if (this.resizeHandler) {
            window.removeEventListener('resize', this.resizeHandler);
            this.resizeHandler = null;
        }

        if (this.repositionFrame !== null) {
            cancelAnimationFrame(this.repositionFrame);
            this.repositionFrame = null;
        }

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

        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.target instanceof HTMLImageElement) {
                    const tracked = this.tracked.get(entry.target);

                    if (tracked) {
                        this.renderPlaceholder(tracked);
                    }
                }
            }
        });

        this.mutationObserver = new MutationObserver((mutations) => this.onMutations(mutations));
        this.mutationObserver.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['src', 'style'],
        });
    }

    private bindWindowEvents(): void {
        // Scroll and resize can shift the bounding rect of any tracked <img>
        // without a layout-affecting mutation (e.g., position: sticky parents),
        // so we reposition every placeholder on the next frame.
        const schedule = (): void => this.scheduleReposition();
        this.scrollHandler = schedule;
        this.resizeHandler = schedule;

        // Capture phase is required to catch scroll events from nested
        // scrollable containers, not just the window itself.
        window.addEventListener('scroll', this.scrollHandler, true);
        window.addEventListener('resize', this.resizeHandler);
    }

    private scheduleReposition(): void {
        if (this.repositionFrame !== null) {
            return;
        }

        this.repositionFrame = requestAnimationFrame(() => {
            this.repositionFrame = null;

            for (const tracked of this.tracked.values()) {
                this.renderPlaceholder(tracked);
            }
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
            } else if (mutation.type === 'attributes' && mutation.target instanceof HTMLImageElement) {
                if (mutation.attributeName === 'src') {
                    // Image source changed: clear cached error state so the
                    // new load is re-evaluated from scratch.
                    this.erroredImages.delete(mutation.target);
                    this.evaluateImage(mutation.target);
                } else if (mutation.attributeName === 'style') {
                    const tracked = this.tracked.get(mutation.target);

                    if (tracked) {
                        this.renderPlaceholder(tracked);
                    }
                }
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
        if (this.isPlaceholderElement(image)) {
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

        const probe = this.buildProbe(image);
        const evaluation = evaluateImage(probe);

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
        this.evaluateImage(image);
    }

    private handleImageLoad(image: HTMLImageElement): void {
        this.erroredImages.delete(image);
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

        const placeholder = document.createElement('div');
        placeholder.setAttribute(PLACEHOLDER_DATA_ATTR, '');
        placeholder.dataset[PLACEHOLDER_DATASET_FLAG] = 'true';
        document.body.appendChild(placeholder);

        const tracked: TrackedImage = {
            image,
            placeholder,
            onError: () => this.handleImageError(image),
            onLoad: () => this.handleImageLoad(image),
        };

        this.tracked.set(image, tracked);
        this.resizeObserver?.observe(image);
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

    private detachTrackedImage(tracked: TrackedImage): void {
        this.resizeObserver?.unobserve(tracked.image);
        this.intersectionObserver?.unobserve(tracked.image);
        tracked.placeholder.remove();
    }

    private isPlaceholderElement(node: Element): boolean {
        if (node instanceof HTMLElement) {
            return node.dataset[PLACEHOLDER_DATASET_FLAG] === 'true';
        }

        return false;
    }

    // ---------- Rendering ----------

    private renderPlaceholder(tracked: TrackedImage): void {
        if (!this.settings) {
            return;
        }

        const rect = tracked.image.getBoundingClientRect();
        const style = window.getComputedStyle(tracked.image);
        const size = decidePlaceholderSize(rect.width, rect.height);

        const config = this.settings.brokenImages;
        const rawSrc = tracked.image.getAttribute('src') ?? '';
        const truncated = rawSrc.length === 0 ? '(no src)' : truncateUrl(rawSrc, config.urlMaxChars);
        const dimensionsLabel = `${size.width}×${size.height}`;

        const placeholder = tracked.placeholder;
        placeholder.style.position = 'fixed';
        placeholder.style.top = `${rect.top}px`;
        placeholder.style.left = `${rect.left}px`;
        placeholder.style.width = `${size.width}px`;
        placeholder.style.height = `${size.height}px`;
        placeholder.style.background = config.backgroundColor;
        placeholder.style.border = `1px solid ${ColorToken.Gray300}`;
        placeholder.style.borderRadius = style.borderRadius;
        placeholder.style.boxSizing = 'border-box';
        placeholder.style.display = 'flex';
        placeholder.style.flexDirection = 'column';
        placeholder.style.alignItems = 'center';
        placeholder.style.justifyContent = 'center';
        placeholder.style.gap = '2px';
        placeholder.style.color = ColorToken.Gray600;
        placeholder.style.font = `${FontWeight.Medium} ${FontSize.Sm}/1.3 ${FontStack.Sans}`;
        placeholder.style.textAlign = 'center';
        placeholder.style.padding = '4px 8px';
        placeholder.style.overflow = 'hidden';
        placeholder.style.pointerEvents = 'none';
        placeholder.style.zIndex = PLACEHOLDER_Z_INDEX;
        placeholder.style.boxShadow = style.boxShadow;
        placeholder.style.clipPath = style.clipPath;

        if (size.showLabel) {
            placeholder.innerHTML = '';

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

            placeholder.appendChild(dimensions);
            placeholder.appendChild(url);
            placeholder.title = `${dimensionsLabel} · ${rawSrc || '(no src)'}`;
        } else {
            placeholder.innerHTML = '';
            placeholder.title = `${dimensionsLabel} · ${rawSrc || '(no src)'}`;
        }
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
