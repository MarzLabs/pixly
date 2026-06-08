import { h } from 'preact';
import { TOOL_ID } from '@shared/constants';
import type { FixBrokenImagesState } from '@shared/types';
import type { Tool, ToolContext } from '@content/core/tool';
import { classifyImage, DEFAULT_MIN_SIZE_PX, type ImageProbe } from './detection';
import { applyPlaceholder, isPatched, restoreImage } from './image-mutator';

/** Hard cap on images scanned per pass so pathological pages cannot hang the tool (spec §6.6). */
const MAX_OBSERVED_IMAGES = 4000;
/** Debounce window (ms) for batching DOM-mutation-driven rescans. */
const RESCAN_DEBOUNCE_MS = 150;

/**
 * Fix Broken Images (spec §6). Scope `origin`. Replaces broken `<img>` elements in place with a
 * reversible SVG placeholder, and keeps watching the DOM for late/lazy/dynamic images.
 *
 * The Tool contract methods stay thin; all heavy logic lives in pure modules (detection,
 * placeholder, image-mutator) so it is testable without a live browser.
 */
export class FixBrokenImagesTool implements Tool<'fix-broken-images'> {
  readonly id = TOOL_ID.fixBrokenImages;
  readonly name = 'Fix Broken Images';
  readonly description =
    'Replace broken images with same-size placeholders so the layout stays intact.';
  readonly icon =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
  readonly scope = 'origin' as const;

  private state: FixBrokenImagesState = this.defaultState();
  private mutationObserver: MutationObserver | null = null;
  private rescanTimer: number | null = null;
  private readonly errored = new WeakSet<HTMLImageElement>();
  /** Tracks images we patched so deactivate can restore exactly those (RF-CORE-3). */
  private readonly patchedImages = new Set<HTMLImageElement>();
  private readonly boundErrorListener = (event: Event): void => this.handleImageEvent(event);
  private readonly boundLoadListener = (event: Event): void => this.handleImageEvent(event);

  constructor(private readonly contextProvider: () => ToolContext) {}

  defaultState(): FixBrokenImagesState {
    return { minSizePx: DEFAULT_MIN_SIZE_PX };
  }

  activate(_context: ToolContext, state: FixBrokenImagesState): void {
    this.state = state;

    // Capture-phase listeners catch error/load on images that fire before per-element handlers.
    document.addEventListener('error', this.boundErrorListener, true);
    document.addEventListener('load', this.boundLoadListener, true);

    this.startObserving();
    this.scanAll();
  }

  deactivate(): void {
    document.removeEventListener('error', this.boundErrorListener, true);
    document.removeEventListener('load', this.boundLoadListener, true);

    this.mutationObserver?.disconnect();
    this.mutationObserver = null;

    if (this.rescanTimer !== null) {
      clearTimeout(this.rescanTimer);
      this.rescanTimer = null;
    }

    for (const image of this.patchedImages) {
      restoreImage(image);
    }

    this.patchedImages.clear();
  }

  renderControls() {
    // Surface the one user-configurable knob: the minimum size threshold (spec §6.2).
    return h('div', { className: 'pixly-control' }, [
      h('label', { className: 'pixly-control__label', key: 'label' }, [
        h('span', { key: 't' }, 'Minimum size (px)'),
        h('span', { key: 'v' }, String(this.state.minSizePx)),
      ]),
      h('input', {
        key: 'input',
        type: 'number',
        min: 1,
        value: this.state.minSizePx,
        onInput: (event: Event) => this.handleMinSizeChange(event),
      }),
    ]);
  }

  serializeState(): FixBrokenImagesState {
    return { ...this.state };
  }

  restoreState(state: FixBrokenImagesState): void {
    this.state = state;
  }

  private handleMinSizeChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    const parsed = Number.parseInt(target.value, 10);

    this.state = { minSizePx: Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MIN_SIZE_PX };

    this.contextProvider().persistState();
    this.scanAll();
  }

  private startObserving(): void {
    this.mutationObserver = new MutationObserver(() => this.scheduleRescan());

    this.mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcset'],
    });
  }

  private scheduleRescan(): void {
    if (this.rescanTimer !== null) {
      return;
    }

    this.rescanTimer = window.setTimeout(() => {
      this.rescanTimer = null;
      this.scanAll();
    }, RESCAN_DEBOUNCE_MS);
  }

  private scanAll(): void {
    const images = document.querySelectorAll<HTMLImageElement>('img');
    const limit = Math.min(images.length, MAX_OBSERVED_IMAGES);

    for (let index = 0; index < limit; index += 1) {
      const image = images[index];

      if (image) {
        this.evaluate(image);
      }
    }
  }

  private handleImageEvent(event: Event): void {
    const target = event.target;

    if (target instanceof HTMLImageElement) {
      if (event.type === 'error') {
        this.errored.add(target);
      }

      this.evaluate(target);
    }
  }

  private evaluate(image: HTMLImageElement): void {
    if (isPatched(image)) {
      this.reconsiderPatched(image);

      return;
    }

    const status = classifyImage(this.toProbe(image), this.state.minSizePx);

    if (status === 'broken') {
      applyPlaceholder(image);
      this.patchedImages.add(image);
    }
  }

  /** A previously-broken image may now load fine after a retry; if so, restore it (spec §6.4). */
  private reconsiderPatched(image: HTMLImageElement): void {
    if (this.errored.has(image)) {
      return;
    }

    // We cannot re-probe the original under a placeholder src; rely on the load event having
    // cleared the errored flag for a genuine recovery, then restore.
    if (image.complete && image.naturalWidth > 0) {
      restoreImage(image);
      this.patchedImages.delete(image);
    }
  }

  private toProbe(image: HTMLImageElement): ImageProbe {
    const rect = image.getBoundingClientRect();

    return {
      complete: image.complete,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      erroredOnLoad: this.errored.has(image),
      renderedWidth: rect.width,
      renderedHeight: rect.height,
      currentSrc: image.currentSrc || image.src,
    };
  }
}
