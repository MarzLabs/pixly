// Typed messaging helpers between popup, content scripts and service worker.

import type { PixlyMessage } from '../types/messages';

export type MessageOf<T extends PixlyMessage['type']> = Extract<PixlyMessage, { type: T }>;

/** Substrings that identify Chrome's "no receiver" rejection.
 *  This rejection is expected and benign when the content script is not
 *  injected into the current tab (chrome:// pages, new-tab page, PDFs, etc.). */
const NO_RECEIVER_FRAGMENTS = [
    'Could not establish connection',
    'Receiving end does not exist',
] as const;

function isNoReceiverError(error: unknown): boolean {
    const text = error instanceof Error ? error.message : String(error);

    return NO_RECEIVER_FRAGMENTS.some((fragment) => text.includes(fragment));
}

/** Send a typed message to the content script running in the given tab.
 *  Returns undefined when the content script is not active on that tab
 *  (e.g. chrome:// pages, new tabs, restricted pages) — that is a normal,
 *  benign condition and is intentionally not re-thrown. */
export async function sendMessageToTab<T extends PixlyMessage['type']>(
    tabId: number,
    message: MessageOf<T>,
): Promise<unknown> {
    try {
        return await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
        if (isNoReceiverError(error)) {
            return undefined;
        }

        console.warn('[Pixly] sendMessageToTab failed:', error);

        return undefined;
    }
}

/** Send a typed message to the extension's service worker.
 *  Returns undefined when the service worker is not reachable — that is
 *  treated as a benign condition (e.g. worker not yet installed). */
export async function sendMessageToRuntime<T extends PixlyMessage['type']>(
    message: MessageOf<T>,
): Promise<unknown> {
    try {
        return await chrome.runtime.sendMessage(message);
    } catch (error) {
        if (isNoReceiverError(error)) {
            return undefined;
        }

        console.warn('[Pixly] sendMessageToRuntime failed:', error);

        return undefined;
    }
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
