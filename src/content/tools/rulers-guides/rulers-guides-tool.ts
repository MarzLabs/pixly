import { h, Fragment } from 'preact';
import { TOOL_ID } from '@shared/constants';
import type { GuideAxis, RulersGuidesState } from '@shared/types';
import type { Tool, ToolContext } from '@content/core/tool';
import { createDefaultRulersGuidesState, sanitizeRulersGuidesState } from './ruler-geometry';
import { RulersGuidesNode } from './rulers-guides-node';

/** New guides spawned from the controls land at the middle of the current viewport. */
const VIEWPORT_CENTER_DIVISOR = 2;

/**
 * Rulers & Guides (spec: rulers_guides_tool). Scope `url`. Edge rulers with pixel ticks in
 * document coordinates, plus draggable guide lines: drag out of a ruler to create one, drag a
 * guide back onto its ruler to delete it. Guides persist per page.
 */
export class RulersGuidesTool implements Tool<'rulers-guides'> {
  readonly id = TOOL_ID.rulersGuides;
  readonly name = 'Rulers & Guides';
  readonly description = 'Pixel rulers on the page edges with draggable, persistent guide lines.';
  readonly icon =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v5H3z"/><path d="M3 3v18h5V3"/><path d="M7 8v-2M11 8v-2M15 8v-2M19 8v-2M8 7h-2M8 11h-2M8 15h-2M8 19h-2"/></svg>';
  readonly scope = 'url' as const;

  private state: RulersGuidesState = this.defaultState();
  private node: RulersGuidesNode | null = null;
  private context: ToolContext | null = null;

  // The tool receives its ToolContext through activate(); no constructor-time context is needed.
  constructor(_contextProvider: () => ToolContext) {}

  defaultState(): RulersGuidesState {
    return createDefaultRulersGuidesState();
  }

  activate(context: ToolContext, state: RulersGuidesState): void {
    this.context = context;
    this.state = sanitizeRulersGuidesState(state);

    const layer = context.shadowRoot.querySelector<HTMLElement>('.pixly-layer') ?? document.body;
    this.node = new RulersGuidesNode(layer, this.state, {
      onGuidesCommit: (guides) => {
        this.state = { ...this.state, guides };
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

  serializeState(): RulersGuidesState {
    return { rulersVisible: this.state.rulersVisible, guides: [...this.state.guides] };
  }

  /** Applies externally-edited persisted state (e.g. from another tab on the same page) live. */
  restoreState(state: RulersGuidesState): void {
    this.state = sanitizeRulersGuidesState(state);
    this.node?.update(this.state);
  }

  renderControls() {
    const guideCount = this.state.guides.length;

    return h(Fragment, null, [
      h('div', { key: 'toggles', className: 'pixly-toggle-row' }, [
        h('label', { key: 'rulers', className: 'pixly-toggle' }, [
          h('input', {
            key: 'i',
            type: 'checkbox',
            checked: this.state.rulersVisible,
            onChange: (event: Event) =>
              this.updateState({ rulersVisible: (event.target as HTMLInputElement).checked }),
          }),
          h('span', { key: 't' }, 'Show rulers'),
        ]),
      ]),
      h('div', { key: 'add', className: 'pixly-control__row' }, [
        h(
          'button',
          { key: 'v', className: 'pixly-btn', onClick: () => this.addGuide('vertical') },
          '+ Vertical guide',
        ),
        h(
          'button',
          { key: 'h', className: 'pixly-btn', onClick: () => this.addGuide('horizontal') },
          '+ Horizontal guide',
        ),
      ]),
      h('div', { key: 'meta', className: 'pixly-control' }, [
        h('label', { key: 'l', className: 'pixly-control__label' }, [
          h('span', { key: 't' }, 'Guides'),
          h('span', { key: 'v' }, String(guideCount)),
        ]),
      ]),
      guideCount > 0
        ? h('div', { key: 'clear', className: 'pixly-control__row' }, [
            h(
              'button',
              {
                key: 'b',
                className: 'pixly-btn pixly-btn--danger',
                onClick: () => this.updateState({ guides: [] }),
              },
              'Clear guides',
            ),
          ])
        : null,
      h(
        'p',
        { key: 'hint', className: 'pixly-feedback' },
        'Drag from a ruler to add a guide; drop a guide on its ruler to delete it.',
      ),
    ]);
  }

  /** Spawns a guide at the center of the current viewport, in document coordinates. */
  private addGuide(axis: GuideAxis): void {
    const positionPx =
      axis === 'vertical'
        ? Math.round(
            window.scrollX + document.documentElement.clientWidth / VIEWPORT_CENTER_DIVISOR,
          )
        : Math.round(
            window.scrollY + document.documentElement.clientHeight / VIEWPORT_CENTER_DIVISOR,
          );

    this.updateState({ guides: [...this.state.guides, { axis, positionPx }] });
  }

  private updateState(partial: Partial<RulersGuidesState>): void {
    this.state = sanitizeRulersGuidesState({ ...this.state, ...partial });
    this.node?.update(this.state);
    this.context?.persistState();
    this.context?.requestControlsRefresh();
  }
}
