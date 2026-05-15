// Service worker: relays keyboard commands to the active tab and handles
// chrome.tabs.captureVisibleTab requests from the content script.

import { MessageType, type PixlyMessage } from '@/shared/types/messages';
import { registerMessageListener, sendMessageToTab } from '@/shared/messaging';

const SNAPSHOT_IMAGE_QUALITY = 100;

// Port name must match the constant in content-script.ts.
const RUNTIME_PORT_NAME = 'pixly-content-script';

// Accept ports opened by content scripts so the port stays alive for the
// lifetime of the tab. Chrome only fires onDisconnect on the content-script
// side when the service worker is torn down (extension reload / update), which
// is exactly the signal we want for orphan cleanup. Without this listener,
// Chrome would disconnect the port immediately and trigger shutdown() on every
// normal page load.
chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== RUNTIME_PORT_NAME) {
        return;
    }

    port.onDisconnect.addListener(() => {
        // The content-script instance for this tab has been torn down or the
        // service worker idle-terminated. No action needed.
    });
});

chrome.commands.onCommand.addListener(async (command) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
        return;
    }

    await sendMessageToTab(tab.id, {
        type: MessageType.CommandTriggered,
        payload: { command },
    });
});

registerMessageListener(async (message: PixlyMessage, sender) => {
    if (message.type === MessageType.TakeSnapshot) {
        try {
            const tabId = sender.tab?.id ?? (await chrome.tabs.query({ active: true, currentWindow: true }))[0]?.id;

            if (!tabId) {
                return { type: MessageType.TakeSnapshotResponse, payload: { dataUrl: null, error: 'No active tab found.' } };
            }

            const tab = await chrome.tabs.get(tabId);

            if (typeof tab.windowId !== 'number') {
                return { type: MessageType.TakeSnapshotResponse, payload: { dataUrl: null, error: 'Tab without window.' } };
            }

            const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
                format: 'png',
                quality: SNAPSHOT_IMAGE_QUALITY,
            });

            return { type: MessageType.TakeSnapshotResponse, payload: { dataUrl } };
        } catch (error) {
            return {
                type: MessageType.TakeSnapshotResponse,
                payload: { dataUrl: null, error: error instanceof Error ? error.message : String(error) },
            };
        }
    }

    return undefined;
});

chrome.runtime.onInstalled.addListener(() => {
    // No-op on install; placeholder for future onboarding logic.
});
