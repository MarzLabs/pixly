// Mounts and manages the single Shadow DOM host used by all tools to render UI
// without leaking styles to (or from) the host page.

import { SHADOW_HOST_ID, SHADOW_HOST_Z_INDEX } from '@/shared/constants/ui';
import shadowStyles from './styles/shadow-ui.css?inline';

const ALL_ZERO_INSET = '0';

let cachedHost: HTMLDivElement | null = null;
let cachedRoot: ShadowRoot | null = null;

export interface ShadowMount {
    host: HTMLDivElement;
    root: ShadowRoot;
    layer: HTMLDivElement;
}

export function ensureShadowMount(): ShadowMount {
    if (cachedHost && cachedRoot && document.body.contains(cachedHost)) {
        const layer = cachedRoot.querySelector<HTMLDivElement>('.pixly-layer');

        if (layer) {
            return { host: cachedHost, root: cachedRoot, layer };
        }
    }

    const host = document.createElement('div');
    host.id = SHADOW_HOST_ID;
    host.setAttribute('data-pixly', 'true');
    host.style.position = 'fixed';
    host.style.top = ALL_ZERO_INSET;
    host.style.left = ALL_ZERO_INSET;
    host.style.width = '0';
    host.style.height = '0';
    host.style.pointerEvents = 'none';
    host.style.zIndex = String(SHADOW_HOST_Z_INDEX);

    const root = host.attachShadow({ mode: 'open' });

    const styleEl = document.createElement('style');
    styleEl.textContent = shadowStyles;
    root.appendChild(styleEl);

    const layer = document.createElement('div');
    layer.className = 'pixly-layer';
    root.appendChild(layer);

    document.body.appendChild(host);

    cachedHost = host;
    cachedRoot = root;

    return { host, root, layer };
}

export function removeShadowMount(): void {
    cachedHost?.remove();
    cachedHost = null;
    cachedRoot = null;
}

export function getShadowRoot(): ShadowRoot | null {
    return cachedRoot;
}
