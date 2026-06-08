import type { ComponentChildren } from 'preact';
import type { ToolId } from '@shared/constants';
import type { ToolScope, ToolStateMap } from '@shared/types';

/**
 * Context handed to every tool. Gives access to the shared Shadow DOM root (for the tool's own
 * UI nodes) and a callback to persist serialized state after the user changes something.
 */
export interface ToolContext {
  /** Shadow root that hosts ALL Pixly UI. Tools attach overlay/control nodes here, never to the page. */
  readonly shadowRoot: ShadowRoot;
  /** Live page href; tools may read it to label or scope their effect. */
  readonly href: string;
  /** Persists the tool's latest serialized state for the current scope (RF-ACT-4). */
  persistState: () => void;
  /** Asks the host UI to refresh the live controls (e.g. after an internal state change). */
  requestControlsRefresh: () => void;
}

/**
 * The contract every Pixly tool implements (spec §4.1). The popup and in-page toolbar are built
 * entirely from registered tools, so adding a tool requires no core changes (RF-CORE-1).
 *
 * Generic over the tool's id so `defaultState`, `serializeState` and `restoreState` are typed
 * against the matching entry in {@link ToolStateMap}.
 */
export interface Tool<Id extends ToolId = ToolId> {
  readonly id: Id;
  /** User-facing name (English, RF-UI-1). */
  readonly name: string;
  readonly description: string;
  /** Inline SVG markup string for the tool's icon. */
  readonly icon: string;
  readonly scope: ToolScope;
  /** Fresh default state used when the tool is first activated for a scope. */
  defaultState(): ToolStateMap[Id];

  /** Turns the effect on for the current page. Called on user activation and on re-apply after reload. */
  activate(context: ToolContext, state: ToolStateMap[Id]): void;
  /** Turns the effect off and restores the page to its original state (RF-CORE-3). */
  deactivate(): void;

  /** Renders the tool's live controls into the in-page toolbar. Returns Preact children. */
  renderControls(): ComponentChildren;

  /** Returns the current state for persistence. */
  serializeState(): ToolStateMap[Id];
  /** Applies a previously persisted state (used during re-apply after reload, RF-ACT-4). */
  restoreState(state: ToolStateMap[Id]): void;
}
