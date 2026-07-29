import { h, Fragment } from 'preact';
import { TOOL_ID } from '@shared/constants';
import type { GridOverlayState } from '@shared/types';
import type { Tool, ToolContext } from '@content/core/tool';
import {
  createDefaultGridState,
  FLUID_WIDTH,
  MAX_BASELINE_PX,
  MAX_COLUMNS,
  MAX_GRID_OPACITY,
  MAX_GUTTER_PX,
  MAX_MARGIN_PX,
  MIN_BASELINE_PX,
  MIN_COLUMNS,
  MIN_GRID_OPACITY,
  MIN_GUTTER_PX,
  MIN_MARGIN_PX,
  sanitizeGridState,
} from './grid-geometry';
import { GridNode } from './grid-node';

/** Factor to turn the 0..1 opacity into a UI percentage and back. */
const PERCENT_FACTOR = 100;

/**
 * Grid Overlay (spec: grid_overlay_tool). Scope `origin`. Paints a Figma-style layout grid over
 * the page — columns/gutter/margins/max-width plus an optional baseline grid — inside the Shadow
 * DOM, pointer-transparent and document-anchored. All controls are live (adjusted while watching
 * the page), so they render in the in-page widget, not the popup.
 */
export class GridOverlayTool implements Tool<'grid-overlay'> {
  readonly id = TOOL_ID.gridOverlay;
  readonly name = 'Grid Overlay';
  readonly description = 'Paint the layout grid (columns, gutters, baseline) over the page.';
  readonly icon =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="4" height="18"/><rect x="10" y="3" width="4" height="18"/><rect x="17" y="3" width="4" height="18"/></svg>';
  readonly scope = 'origin' as const;

  private state: GridOverlayState = this.defaultState();
  private gridNode: GridNode | null = null;
  private context: ToolContext | null = null;

  // The grid receives its ToolContext through activate(); no constructor-time context is needed.
  constructor(_contextProvider: () => ToolContext) {}

  defaultState(): GridOverlayState {
    return createDefaultGridState();
  }

  activate(context: ToolContext, state: GridOverlayState): void {
    this.context = context;
    this.state = sanitizeGridState(state);

    const layer = context.shadowRoot.querySelector<HTMLElement>('.pixly-layer') ?? document.body;
    this.gridNode = new GridNode(layer, this.state);
  }

  deactivate(): void {
    this.gridNode?.destroy();
    this.gridNode = null;
    this.context = null;
  }

  serializeState(): GridOverlayState {
    return { ...this.state };
  }

  /** Applies externally-edited persisted state (e.g. from another same-origin tab) live. */
  restoreState(state: GridOverlayState): void {
    this.state = sanitizeGridState(state);
    this.gridNode?.update(this.state);
  }

  renderControls() {
    const opacityPercent = Math.round(this.state.opacity * PERCENT_FACTOR);

    return h(Fragment, null, [
      this.renderNumberRow('Columns', this.state.columns, MIN_COLUMNS, MAX_COLUMNS, (value) =>
        this.updateState({ columns: value }),
      ),
      this.renderNumberRow(
        'Gutter (px)',
        this.state.gutterPx,
        MIN_GUTTER_PX,
        MAX_GUTTER_PX,
        (value) => this.updateState({ gutterPx: value }),
      ),
      this.renderNumberRow(
        'Side margin (px)',
        this.state.marginPx,
        MIN_MARGIN_PX,
        MAX_MARGIN_PX,
        (value) => this.updateState({ marginPx: value }),
      ),
      this.renderMaxWidthRow(),
      this.renderOpacitySlider(opacityPercent),
      this.renderColorRow(),
      this.renderToggleRow(),
      this.state.showBaseline
        ? this.renderNumberRow(
            'Baseline (px)',
            this.state.baselinePx,
            MIN_BASELINE_PX,
            MAX_BASELINE_PX,
            (value) => this.updateState({ baselinePx: value }),
          )
        : null,
    ]);
  }

  private renderNumberRow(
    label: string,
    value: number,
    min: number,
    max: number,
    onCommit: (value: number) => void,
  ) {
    return h('div', { key: label, className: 'pixly-control' }, [
      h('label', { key: 'l', className: 'pixly-control__label' }, [h('span', { key: 't' }, label)]),
      h('input', {
        key: 'i',
        type: 'number',
        min,
        max,
        value,
        onChange: (event: Event) => {
          const parsed = Number.parseInt((event.target as HTMLInputElement).value, 10);

          if (Number.isFinite(parsed)) {
            onCommit(parsed);
          }
        },
      }),
    ]);
  }

  private renderMaxWidthRow() {
    const isFluid = this.state.maxWidthPx === FLUID_WIDTH;

    return h('div', { key: 'max-width', className: 'pixly-control' }, [
      h('label', { key: 'l', className: 'pixly-control__label' }, [
        h('span', { key: 't' }, 'Max width (px, 0 = fluid)'),
        h('span', { key: 'v' }, isFluid ? 'fluid' : `${this.state.maxWidthPx}px`),
      ]),
      h('input', {
        key: 'i',
        type: 'number',
        min: FLUID_WIDTH,
        value: this.state.maxWidthPx,
        onChange: (event: Event) => {
          const parsed = Number.parseInt((event.target as HTMLInputElement).value, 10);

          if (Number.isFinite(parsed)) {
            this.updateState({ maxWidthPx: parsed });
          }
        },
      }),
    ]);
  }

  private renderOpacitySlider(opacityPercent: number) {
    return h('div', { key: 'opacity', className: 'pixly-control' }, [
      h('label', { key: 'l', className: 'pixly-control__label' }, [
        h('span', { key: 't' }, 'Opacity'),
        h('span', { key: 'v' }, `${opacityPercent}%`),
      ]),
      h('input', {
        key: 'i',
        type: 'range',
        min: MIN_GRID_OPACITY * PERCENT_FACTOR,
        max: MAX_GRID_OPACITY * PERCENT_FACTOR,
        value: opacityPercent,
        onInput: (event: Event) =>
          this.updateState({
            opacity: Number((event.target as HTMLInputElement).value) / PERCENT_FACTOR,
          }),
      }),
    ]);
  }

  private renderColorRow() {
    return h('div', { key: 'color', className: 'pixly-control' }, [
      h('label', { key: 'l', className: 'pixly-control__label' }, [
        h('span', { key: 't' }, 'Color'),
      ]),
      h('input', {
        key: 'i',
        type: 'color',
        value: this.state.color,
        onInput: (event: Event) =>
          this.updateState({ color: (event.target as HTMLInputElement).value }),
      }),
    ]);
  }

  private renderToggleRow() {
    return h('div', { key: 'toggles', className: 'pixly-toggle-row' }, [
      h('label', { key: 'baseline', className: 'pixly-toggle' }, [
        h('input', {
          key: 'i',
          type: 'checkbox',
          checked: this.state.showBaseline,
          onChange: (event: Event) =>
            this.updateState({ showBaseline: (event.target as HTMLInputElement).checked }),
        }),
        h('span', { key: 't' }, 'Baseline'),
      ]),
      h('label', { key: 'hide', className: 'pixly-toggle' }, [
        h('input', {
          key: 'i',
          type: 'checkbox',
          checked: this.state.hidden,
          onChange: (event: Event) =>
            this.updateState({ hidden: (event.target as HTMLInputElement).checked }),
        }),
        h('span', { key: 't' }, 'Hide'),
      ]),
    ]);
  }

  private updateState(partial: Partial<GridOverlayState>): void {
    this.state = sanitizeGridState({ ...this.state, ...partial });
    this.gridNode?.update(this.state);
    this.context?.persistState();
    this.context?.requestControlsRefresh();
  }
}
