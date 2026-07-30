import { h, Fragment } from 'preact';
import { TOOL_ID } from '@shared/constants';
import type { DistanceMeterState, Measurement } from '@shared/types';
import type { Tool, ToolContext } from '@content/core/tool';
import {
  computeDelta,
  createDefaultDistanceMeterState,
  formatMeasurementLabel,
  MAX_SNAP_RADIUS_PX,
  MIN_SNAP_RADIUS_PX,
  sanitizeDistanceMeterState,
  segmentMidpoint,
} from './distance-geometry';
import { DistanceMeterNode } from './distance-meter-node';

/** Scroll target centering divisor: the measurement midpoint lands mid-viewport. */
const VIEWPORT_CENTER_DIVISOR = 2;

/**
 * Distance Meter (spec: distance_meter_tool). Scope `url`. Drag between two points to measure
 * Δx / Δy and the straight-line distance, with endpoints snapping to element edges within a
 * configurable radius. Multiple measurements coexist, stay visible, and persist per page;
 * pausing lets clicks pass through to the page.
 */
export class DistanceMeterTool implements Tool<'distance-meter'> {
  readonly id = TOOL_ID.distanceMeter;
  readonly name = 'Distance Meter';
  readonly description = 'Drag between two points to measure pixel distances on the page.';
  readonly icon =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20L20 4"/><circle cx="4" cy="20" r="2"/><circle cx="20" cy="4" r="2"/><path d="M9 15l1.5 1.5M13 11l1.5 1.5"/></svg>';
  readonly scope = 'url' as const;

  private state: DistanceMeterState = this.defaultState();
  private node: DistanceMeterNode | null = null;
  private context: ToolContext | null = null;

  // The tool receives its ToolContext through activate(); no constructor-time context is needed.
  constructor(_contextProvider: () => ToolContext) {}

  defaultState(): DistanceMeterState {
    return createDefaultDistanceMeterState();
  }

  activate(context: ToolContext, state: DistanceMeterState): void {
    this.context = context;
    this.state = sanitizeDistanceMeterState(state);

    const layer = context.shadowRoot.querySelector<HTMLElement>('.pixly-layer') ?? document.body;
    this.node = new DistanceMeterNode(layer, this.state, {
      onMeasurementsCommit: (measurements) => {
        this.state = { ...this.state, measurements };
        this.context?.persistState();
        this.context?.requestControlsRefresh();
      },
    });
  }

  deactivate(): void {
    this.node?.destroy();
    this.node = null;
    this.context = null;
  }

  serializeState(): DistanceMeterState {
    return sanitizeDistanceMeterState(this.state);
  }

  /** Applies externally-edited persisted state (e.g. from another tab on the same page) live. */
  restoreState(state: DistanceMeterState): void {
    this.state = sanitizeDistanceMeterState(state);
    this.node?.update(this.state);
  }

  renderControls() {
    const count = this.state.measurements.length;

    return h(Fragment, null, [
      h('div', { key: 'readout', className: 'pixly-control' }, [
        h('label', { key: 'l', className: 'pixly-control__label' }, [
          h('span', { key: 't' }, `Measurements (${count})`),
        ]),
        count > 0 ? this.renderMeasurementList() : null,
      ]),
      h('div', { key: 'snap', className: 'pixly-control' }, [
        h('label', { key: 'l', className: 'pixly-control__label' }, [
          h('span', { key: 't' }, 'Snap radius (px, 0 = off)'),
          h('span', { key: 'v' }, String(this.state.snapRadiusPx)),
        ]),
        h('input', {
          key: 'i',
          type: 'number',
          min: MIN_SNAP_RADIUS_PX,
          max: MAX_SNAP_RADIUS_PX,
          value: this.state.snapRadiusPx,
          onChange: (event: Event) => {
            const parsed = Number.parseInt((event.target as HTMLInputElement).value, 10);

            if (Number.isFinite(parsed)) {
              this.updateState({ snapRadiusPx: parsed });
            }
          },
        }),
      ]),
      h('div', { key: 'toggles', className: 'pixly-toggle-row' }, [
        h(
          'label',
          { key: 'pause', className: 'pixly-toggle', title: 'Let clicks pass through to the page' },
          [
            h('input', {
              key: 'i',
              type: 'checkbox',
              checked: this.state.paused,
              onChange: (event: Event) =>
                this.updateState({ paused: (event.target as HTMLInputElement).checked }),
            }),
            h('span', { key: 't' }, 'Pause'),
          ],
        ),
      ]),
      count > 0
        ? h('div', { key: 'clear', className: 'pixly-control__row' }, [
            h(
              'button',
              {
                key: 'b',
                className: 'pixly-btn pixly-btn--danger',
                onClick: () => this.updateState({ measurements: [] }),
              },
              'Clear all measurements',
            ),
          ])
        : null,
      h(
        'p',
        { key: 'hint', className: 'pixly-feedback' },
        'Drag to measure · Shift locks the axis · Esc cancels · click a label to remove one.',
      ),
    ]);
  }

  /** One row per measurement: click scrolls it into view, the × button removes it. */
  private renderMeasurementList() {
    return h(
      'div',
      { key: 'list', className: 'pixly-meter-list' },
      this.state.measurements.map((measurement, index) =>
        h(
          'div',
          {
            key: index,
            className: 'pixly-meter-list__row',
            title: 'Scroll to this measurement',
            onClick: () => scrollToMeasurement(measurement),
            // Cross-highlight: hovering a row accents its figure on the page.
            onPointerEnter: () => this.node?.setHoverAccent(index),
            onPointerLeave: () => this.node?.setHoverAccent(null),
          },
          [
            h(
              'span',
              { key: 't', className: 'pixly-meter-list__text' },
              `${index + 1} · ${formatMeasurementLabel(computeDelta(measurement.segment))}`,
            ),
            h(
              'button',
              {
                key: 'x',
                className: 'pixly-iconbtn pixly-meter-list__remove',
                title: 'Remove this measurement',
                onClick: (event: Event) => {
                  event.stopPropagation();
                  this.removeMeasurement(index);
                },
              },
              '×',
            ),
          ],
        ),
      ),
    );
  }

  private removeMeasurement(index: number): void {
    this.updateState({
      measurements: this.state.measurements.filter((_, current) => current !== index),
    });
  }

  private updateState(partial: Partial<DistanceMeterState>): void {
    this.state = sanitizeDistanceMeterState({ ...this.state, ...partial });
    this.node?.update(this.state);
    this.context?.persistState();
    this.context?.requestControlsRefresh();
  }
}

/** Smooth-scrolls the page so the measurement's midpoint lands mid-viewport. */
function scrollToMeasurement(measurement: Measurement): void {
  const midpoint = segmentMidpoint(measurement.segment);

  window.scrollTo({
    left: midpoint.x - document.documentElement.clientWidth / VIEWPORT_CENTER_DIVISOR,
    top: midpoint.y - document.documentElement.clientHeight / VIEWPORT_CENTER_DIVISOR,
    behavior: 'smooth',
  });
}
