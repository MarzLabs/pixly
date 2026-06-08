import { h, Fragment } from 'preact';
import { TOOL_ID } from '@shared/constants';
import type { BlendMode, OverlayState } from '@shared/types';
import { BLEND_MODES } from '@shared/types';
import type { Tool, ToolContext } from '@content/core/tool';
import {
  deleteOverlayImage,
  getOverlayImage,
  putOverlayImage,
} from '@shared/persistence/overlay-image-store';
import { OverlayNode } from './overlay-node';
import {
  clampOpacity,
  clampScale,
  createDefaultOverlayState,
  isBlendMode,
  MAX_OPACITY,
  MAX_SCALE,
  MIN_OPACITY,
  MIN_SCALE,
} from './overlay-geometry';
import {
  extractImageFile,
  PERSIST_WARN_BYTES,
  readImageBlob,
} from './image-loader';

/** Factor to turn a 0..1 scale factor into a UI percentage and back. */
const PERCENT_FACTOR = 100;
/** Slider granularity for opacity (0..100 in the UI). */
const OPACITY_SLIDER_MAX = 100;
/** Slider granularity for scale (percent). */
const SCALE_SLIDER_MIN = MIN_SCALE * PERCENT_FACTOR;
const SCALE_SLIDER_MAX = MAX_SCALE * PERCENT_FACTOR;

/**
 * Image Overlay (spec §7). Scope `url`. Renders a draggable image overlay inside the Shadow DOM and
 * exposes opacity / blend / position / scale / lock / show-hide / replace-remove controls. The
 * binary lives in IndexedDB; this light state lives in chrome.storage via the orchestrator.
 */
export class ImageOverlayTool implements Tool<'image-overlay'> {
  readonly id = TOOL_ID.imageOverlay;
  readonly name = 'Image Overlay';
  readonly description = 'Overlay a design export to compare it pixel-by-pixel with the page.';
  readonly icon =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="13" height="13" rx="2"/><rect x="8" y="8" width="13" height="13" rx="2"/></svg>';
  readonly scope = 'url' as const;

  private state: OverlayState = this.defaultState();
  private overlayNode: OverlayNode | null = null;
  private context: ToolContext | null = null;
  private feedback: { message: string; isError: boolean } | null = null;

  // The overlay receives its ToolContext through activate(); no constructor-time context is needed.
  constructor(_contextProvider: () => ToolContext) {}

  defaultState(): OverlayState {
    return createDefaultOverlayState();
  }

  activate(context: ToolContext, state: OverlayState): void {
    this.context = context;
    this.state = state;

    this.overlayNode = new OverlayNode(context.shadowRoot.querySelector('.pixly-layer') ?? document.body, state, {
      onOffsetCommit: (offsetX, offsetY) => {
        this.state = { ...this.state, offsetX, offsetY };
        this.context?.persistState();
      },
      onResizeCommit: (scale, offsetX, offsetY) => {
        this.state = { ...this.state, scale, offsetX, offsetY };
        this.context?.persistState();
        this.context?.requestControlsRefresh();
      },
    });

    // Re-apply a persisted image after reload (RF-ACT-4): pull the binary from IndexedDB.
    if (state.imageKey) {
      void this.rehydrateImage(state.imageKey);
    }
  }

  deactivate(): void {
    this.overlayNode?.destroy();
    this.overlayNode = null;
    this.context = null;
  }

  serializeState(): OverlayState {
    return { ...this.state };
  }

  restoreState(state: OverlayState): void {
    this.state = state;
    this.overlayNode?.update(state);
  }

  renderControls() {
    const opacityPercent = Math.round(this.state.opacity * OPACITY_SLIDER_MAX);
    const scalePercent = Math.round(this.state.scale * PERCENT_FACTOR);
    const hasImage = this.state.imageKey !== null;

    return h(Fragment, null, [
      this.renderDropZone(hasImage),
      this.renderFeedback(),
      hasImage ? this.renderImageControls(opacityPercent, scalePercent) : null,
    ]);
  }

  /** "120% · 640 × 480 px" once the image has loaded, otherwise just the scale percentage. */
  private scaleValueText(scalePercent: number): string {
    const natural = this.overlayNode?.getNaturalSize() ?? null;

    if (!natural) {
      return `${scalePercent}%`;
    }

    const width = Math.round(natural.width * this.state.scale);
    const height = Math.round(natural.height * this.state.scale);

    return `${scalePercent}% · ${width} × ${height} px`;
  }

  private renderDropZone(hasImage: boolean) {
    return h(
      'div',
      {
        key: 'dropzone',
        className: 'pixly-dropzone',
        onClick: () => this.openFilePicker(),
        onDragOver: (event: DragEvent) => {
          event.preventDefault();
          (event.currentTarget as HTMLElement).classList.add('pixly-dropzone--active');
        },
        onDragLeave: (event: DragEvent) => {
          (event.currentTarget as HTMLElement).classList.remove('pixly-dropzone--active');
        },
        onDrop: (event: DragEvent) => this.handleDrop(event),
      },
      hasImage ? 'Drop, paste, or click to replace the image' : 'Drop, paste, or click to add an image',
    );
  }

  private renderFeedback() {
    if (!this.feedback) {
      return h('div', { key: 'feedback', className: 'pixly-feedback' }, '');
    }

    return h(
      'div',
      {
        key: 'feedback',
        className: `pixly-feedback${this.feedback.isError ? ' pixly-feedback--error' : ''}`,
      },
      this.feedback.message,
    );
  }

  private renderImageControls(opacityPercent: number, scalePercent: number) {
    return h(Fragment, { key: 'controls' }, [
      this.renderSlider('Opacity', `${opacityPercent}%`, {
        min: MIN_OPACITY * OPACITY_SLIDER_MAX,
        max: MAX_OPACITY * OPACITY_SLIDER_MAX,
        value: opacityPercent,
        onInput: (value) => this.updateState({ opacity: clampOpacity(value / OPACITY_SLIDER_MAX) }),
      }),
      this.renderBlendSelect(),
      this.renderSlider('Scale', this.scaleValueText(scalePercent), {
        min: SCALE_SLIDER_MIN,
        max: SCALE_SLIDER_MAX,
        value: scalePercent,
        onInput: (value) => this.updateState({ scale: clampScale(value / PERCENT_FACTOR) }),
      }),
      this.renderPositionInputs(),
      this.renderToggleRow(),
      this.renderActionRow(),
    ]);
  }

  private renderSlider(
    label: string,
    valueText: string,
    options: { min: number; max: number; value: number; onInput: (value: number) => void },
  ) {
    return h('div', { key: label, className: 'pixly-control' }, [
      h('label', { key: 'l', className: 'pixly-control__label' }, [
        h('span', { key: 't' }, label),
        h('span', { key: 'v' }, valueText),
      ]),
      h('input', {
        key: 'i',
        type: 'range',
        min: options.min,
        max: options.max,
        value: options.value,
        onInput: (event: Event) =>
          options.onInput(Number((event.target as HTMLInputElement).value)),
      }),
    ]);
  }

  private renderBlendSelect() {
    return h('div', { key: 'blend', className: 'pixly-control' }, [
      h('label', { key: 'l', className: 'pixly-control__label' }, [h('span', { key: 't' }, 'Blend mode')]),
      h(
        'select',
        {
          key: 's',
          value: this.state.blendMode,
          onChange: (event: Event) => {
            const value = (event.target as HTMLSelectElement).value;

            if (isBlendMode(value)) {
              this.updateState({ blendMode: value as BlendMode });
            }
          },
        },
        BLEND_MODES.map((mode) => h('option', { key: mode, value: mode }, mode)),
      ),
    ]);
  }

  private renderPositionInputs() {
    return h('div', { key: 'position', className: 'pixly-control' }, [
      h('label', { key: 'l', className: 'pixly-control__label' }, [h('span', { key: 't' }, 'Position (X / Y)')]),
      h('div', { key: 'r', className: 'pixly-control__row' }, [
        h('input', {
          key: 'x',
          type: 'number',
          value: Math.round(this.state.offsetX),
          onChange: (event: Event) =>
            this.updateState({ offsetX: Number((event.target as HTMLInputElement).value) }),
        }),
        h('input', {
          key: 'y',
          type: 'number',
          value: Math.round(this.state.offsetY),
          onChange: (event: Event) =>
            this.updateState({ offsetY: Number((event.target as HTMLInputElement).value) }),
        }),
      ]),
    ]);
  }

  private renderToggleRow() {
    return h('div', { key: 'toggles', className: 'pixly-control__row' }, [
      h(
        'label',
        { key: 'lock', className: 'pixly-toggle' },
        [
          h('input', {
            key: 'i',
            type: 'checkbox',
            checked: this.state.locked,
            onChange: (event: Event) =>
              this.updateState({ locked: (event.target as HTMLInputElement).checked }),
          }),
          h('span', { key: 't' }, 'Lock'),
        ],
      ),
      h(
        'label',
        { key: 'hide', className: 'pixly-toggle' },
        [
          h('input', {
            key: 'i',
            type: 'checkbox',
            checked: this.state.hidden,
            onChange: (event: Event) =>
              this.updateState({ hidden: (event.target as HTMLInputElement).checked }),
          }),
          h('span', { key: 't' }, 'Hide'),
        ],
      ),
    ]);
  }

  private renderActionRow() {
    return h('div', { key: 'actions', className: 'pixly-control__row' }, [
      h(
        'button',
        { key: 'replace', className: 'pixly-btn', onClick: () => this.openFilePicker() },
        'Replace',
      ),
      h(
        'button',
        { key: 'remove', className: 'pixly-btn pixly-btn--danger', onClick: () => void this.removeImage() },
        'Remove',
      ),
    ]);
  }

  private updateState(partial: Partial<OverlayState>): void {
    this.state = { ...this.state, ...partial };
    this.overlayNode?.update(this.state);
    this.context?.persistState();
    this.context?.requestControlsRefresh();
  }

  private openFilePicker(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';

    input.onchange = () => {
      const file = input.files?.[0];

      if (file) {
        void this.loadFile(file);
      }
    };

    input.click();
  }

  private handleDrop(event: DragEvent): void {
    event.preventDefault();
    (event.currentTarget as HTMLElement).classList.remove('pixly-dropzone--active');

    const file = extractImageFile(event.dataTransfer);

    if (file) {
      void this.loadFile(file);
    }
  }

  /** Public entry point so the toolbar can forward window-level paste events to the active tool. */
  handlePastedFile(file: File): void {
    void this.loadFile(file);
  }

  private async loadFile(file: File): Promise<void> {
    const result = await readImageBlob(file, file.name);

    if (!result.ok) {
      this.setFeedback(result.error, true);

      return;
    }

    const imageKey = this.state.imageKey ?? `overlay-${this.context?.href ?? ''}-${Date.now()}`;
    const stored = await putOverlayImage(imageKey, result.data);

    if (!stored.ok) {
      // The overlay still works this session; warn that it may not survive reloads (spec §7.7).
      this.overlayNode?.setImageBlob(file);
      this.state = { ...this.state, imageKey: null };
      this.setFeedback('Image added (too large to persist across reloads).', true);
      this.context?.requestControlsRefresh();

      return;
    }

    this.overlayNode?.setImageBlob(file);
    this.state = { ...this.state, imageKey };
    this.context?.persistState();

    const sizeWarning =
      file.size > PERSIST_WARN_BYTES ? ' (large file — persistence may be slow)' : '';
    this.setFeedback(`Image added${sizeWarning}.`, false);
    this.context?.requestControlsRefresh();
  }

  private async rehydrateImage(imageKey: string): Promise<void> {
    const stored = await getOverlayImage(imageKey);

    if (stored) {
      this.overlayNode?.setImageBlob(stored.blob);
    } else {
      // The binary was evicted; clear the dangling key so the UI offers to add a new image.
      this.state = { ...this.state, imageKey: null };
      this.context?.persistState();
      this.context?.requestControlsRefresh();
    }
  }

  private async removeImage(): Promise<void> {
    if (this.state.imageKey) {
      await deleteOverlayImage(this.state.imageKey);
    }

    this.state = createDefaultOverlayState();
    this.overlayNode?.update(this.state);
    this.context?.persistState();
    this.setFeedback('Overlay removed.', false);
    this.context?.requestControlsRefresh();
  }

  private setFeedback(message: string, isError: boolean): void {
    this.feedback = { message, isError };
    this.context?.requestControlsRefresh();
  }
}
