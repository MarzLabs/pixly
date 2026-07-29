import { TOOL_ID } from '@shared/constants';
import type { GlobalOutlinesState } from '@shared/types';
import type { Tool, ToolContext } from '@content/core/tool';
import {
  buildOutlineCss,
  createDefaultGlobalOutlinesState,
  sanitizeGlobalOutlinesState,
} from './outline-css';

/** Id of the injected stylesheet, so re-injection (MV3) can find and replace a leftover node. */
const STYLE_ELEMENT_ID = 'pixly-global-outlines-style';

/**
 * Global Outlines (spec: global_outlines_tool). Scope `origin`. Outlines every element on the
 * page — colored by nesting depth or with a single color — by injecting one `<style>` node, the
 * only page mutation this tool makes; deactivation removes it, restoring the page fully
 * (RF-CORE-3).
 *
 * A set-and-forget tool: no live controls (no `renderControls`), so it never summons the in-page
 * widget. Its configuration (width, color mode) is edited from the popup via the catalog's config
 * fields and arrives here through `restoreState`.
 */
export class GlobalOutlinesTool implements Tool<'global-outlines'> {
  readonly id = TOOL_ID.globalOutlines;
  readonly name = 'Global Outlines';
  readonly description = 'Outline every element on the page to reveal the real layout structure.';
  readonly icon =
    '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"><rect x="3" y="3" width="18" height="18" rx="1"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>';
  readonly scope = 'origin' as const;

  private state: GlobalOutlinesState = this.defaultState();
  private styleElement: HTMLStyleElement | null = null;

  // Config edits arrive via restoreState(); this tool needs no runtime context of its own.
  constructor(_contextProvider: () => ToolContext) {}

  defaultState(): GlobalOutlinesState {
    return createDefaultGlobalOutlinesState();
  }

  activate(_context: ToolContext, state: GlobalOutlinesState): void {
    this.state = sanitizeGlobalOutlinesState(state);
    this.injectStylesheet();
  }

  deactivate(): void {
    this.styleElement?.remove();
    this.styleElement = null;
  }

  serializeState(): GlobalOutlinesState {
    return { ...this.state };
  }

  /** Applies externally-edited config (popup) live by rewriting the injected stylesheet. */
  restoreState(state: GlobalOutlinesState): void {
    this.state = sanitizeGlobalOutlinesState(state);

    if (this.styleElement) {
      this.styleElement.textContent = buildOutlineCss(this.state);
    }
  }

  private injectStylesheet(): void {
    // A leftover node from a previous injection (MV3 re-injection) is replaced, never duplicated.
    document.getElementById(STYLE_ELEMENT_ID)?.remove();

    const element = document.createElement('style');
    element.id = STYLE_ELEMENT_ID;
    element.textContent = buildOutlineCss(this.state);

    document.documentElement.appendChild(element);
    this.styleElement = element;
  }
}
