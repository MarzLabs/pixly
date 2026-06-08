import { SHADOW_HOST_ID, PIXLY_MAX_Z_INDEX } from '@shared/constants';
import { tokensToCssVariables } from '@shared/constants/design-tokens';
import shadowStyles from './shadow-ui.css?inline';

/**
 * Owns the single host element + Shadow DOM that contains ALL Pixly UI (toolbar, overlay, controls)
 * per RF-CORE-2. The host is fixed, full-viewport, and pointer-transparent by default so the page
 * stays fully interactive; individual UI nodes re-enable pointer events on themselves.
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

    // The host itself must never affect page layout or capture clicks meant for the page.
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = String(PIXLY_MAX_Z_INDEX);
    host.style.pointerEvents = 'none';

    const root = host.attachShadow({ mode: 'open' });

    const styleEl = document.createElement('style');
    styleEl.textContent = `:host {\n  ${tokensToCssVariables()}\n}\n${shadowStyles}`;
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
