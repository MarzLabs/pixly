// Typed messaging helpers between popup, content scripts and service worker.

import type { PixlyMessage } from '../types/messages';

export type MessageOf<T extends PixlyMessage['type']> = Extract<PixlyMessage, { type: T }>;

export function sendMessageToTab<T extends PixlyMessage['type']>(
    tabId: number,
    message: MessageOf<T>,
): Promise<unknown> {
    return chrome.tabs.sendMessage(tabId, message);
}

export function sendMessageToRuntime<T extends PixlyMessage['type']>(
    message: MessageOf<T>,
): Promise<unknown> {
    return chrome.runtime.sendMessage(message);
}

export type MessageListener = (
    message: PixlyMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: unknown) => void,
) => boolean | void | Promise<unknown>;

export function registerMessageListener(listener: MessageListener): void {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        const result = listener(message as PixlyMessage, sender, sendResponse);

        if (result instanceof Promise) {
            result.then(sendResponse).catch((error: unknown) => {
                sendResponse({ error: String(error) });
            });

            return true;
        }

        return result === true;
    });
}
