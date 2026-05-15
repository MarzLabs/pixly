// Lightweight transient notifications rendered inside the Shadow DOM.

import { NOTIFICATION_DURATION_MS } from '@/shared/constants/ui';
import { ensureShadowMount } from './shadow-host';

export function showNotification(message: string): void {
    const { layer } = ensureShadowMount();

    const node = document.createElement('div');
    node.className = 'pixly-notification';
    node.textContent = message;

    layer.appendChild(node);

    setTimeout(() => {
        node.remove();
    }, NOTIFICATION_DURATION_MS);
}
