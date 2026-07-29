import { SHADOW_HOST_ID, PIXLY_MAX_Z_INDEX } from '@shared/constants';
import { tokensToCssVariables } from '@shared/constants/design-tokens';
import shadowStyles from './shadow-ui.css?inline';

/**
 * The host carries NO z-index on purpose: a z-index there forms a stacking context that would
 * isolate the overlay's mix-blend-mode from the page, leaving blend modes with nothing to blend
 * against. Each top-level UI node gets its own z-index instead — the toolbar one level above the
 * overlay so its controls stay clickable.
 */
const TOOLBAR_ABOVE_OVERLAY = 1;
const OVERLAY_ABOVE_GRID = 1;
const TOOLBAR_Z_INDEX = PIXLY_MAX_Z_INDEX;
const OVERLAY_Z_INDEX = PIXLY_MAX_Z_INDEX - TOOLBAR_ABOVE_OVERLAY;
const GRID_Z_INDEX = OVERLAY_Z_INDEX - OVERLAY_ABOVE_GRID;

/**
 * Owns the single host element + Shadow DOM that contains ALL Pixly UI (toolbar, overlay, controls)
 * per RF-CORE-2. The host is document-anchored, zero-size, and pointer-transparent by default so the
 * page stays fully interactive; individual UI nodes re-enable pointer events on themselves.
 */
export class ShadowHost {
  private hostElement: HTMLDivElement | null = null;
  private root: ShadowRoot | null = null;

  /** Mounts the host once. Idempotent: a second call returns the existing root (MV3 re-injection safe). */
  mount(): ShadowRoot {
    if (this.root) {
      return this.root;
    }

    const existing = document.getElementById(SHADOW_HOST_ID);

    if (existing && existing.shadowRoot) {
      this.hostElement = existing as HTMLDivElement;
      this.root = existing.shadowRoot;

      return this.root;
    }

    const host = document.createElement('div');
    host.id = SHADOW_HOST_ID;

    // Absolute (not fixed) so document-anchored overlays scroll natively with the page; the toolbar
    // and any viewport-pinned overlay use their own `position: fixed`. Zero-size so the host never
    // affects page layout, and pointer-transparent so clicks meant for the page pass through. No
    // z-index here on purpose (see TOOLBAR_Z_INDEX/OVERLAY_Z_INDEX above).
    host.style.position = 'absolute';
    host.style.top = '0';
    host.style.left = '0';
    host.style.width = '0';
    host.style.height = '0';
    host.style.pointerEvents = 'none';

    const root = host.attachShadow({ mode: 'open' });

    const styleEl = document.createElement('style');
    styleEl.textContent =
      `:host {\n  ${tokensToCssVariables()}\n` +
      `  --pixly-z-toolbar: ${TOOLBAR_Z_INDEX};\n` +
      `  --pixly-z-overlay: ${OVERLAY_Z_INDEX};\n` +
      `  --pixly-z-grid: ${GRID_Z_INDEX};\n}\n` +
      shadowStyles;
    root.appendChild(styleEl);

    const layer = document.createElement('div');
    layer.className = 'pixly-layer';
    root.appendChild(layer);

    document.documentElement.appendChild(host);

    this.hostElement = host;
    this.root = root;

    return root;
  }

  /** The container all UI nodes should be appended to (separate from the <style> node). */
  get layer(): HTMLElement {
    const root = this.mount();
    const layer = root.querySelector<HTMLElement>('.pixly-layer');

    if (!layer) {
      throw new Error('Pixly UI layer missing from shadow root');
    }

    return layer;
  }

  /** Pushes a runtime CSS variable onto the host (inline styles win over :host by specificity). */
  setCssVariable(name: string, value: string): void {
    this.hostElement?.style.setProperty(name, value);
  }

  /** Removes the host entirely, used when global disable wipes all Pixly UI from the page. */
  unmount(): void {
    this.hostElement?.remove();
    this.hostElement = null;
    this.root = null;
  }
}
