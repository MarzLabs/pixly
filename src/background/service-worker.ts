// Service worker: relays keyboard commands to the active tab and handles
// chrome.tabs.captureVisibleTab requests from the content script.

import { MessageType, type PixlyMessage } from '@/shared/types/messages';
import { registerMessageListener, sendMessageToTab } from '@/shared/messaging';

const SNAPSHOT_IMAGE_QUALITY = 100;

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
