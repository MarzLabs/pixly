import { createEmptyConfig } from '@shared/persistence/config-document';
import { isCommandId, STORAGE_ROOT_KEY } from '@shared/constants';
import type { CaptureReply, ContentToBackgroundMessage } from '@shared/messaging/messages';
import { sendToTab } from '@shared/messaging/send';

/**
 * MV3 service worker (spec §9). Coordinates extension-level concerns: seeds an empty config on
 * install so the popup and content scripts always read a valid document, forwards keyboard
 * shortcuts (chrome.commands) to the tab's content script, and captures the visible tab for the
 * Snapshot tool (chrome.tabs.captureVisibleTab only exists in extension contexts). Per-page
 * effects are handled entirely by the content script.
 */

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(STORAGE_ROOT_KEY);

  if (!existing[STORAGE_ROOT_KEY]) {
    await chrome.storage.local.set({ [STORAGE_ROOT_KEY]: createEmptyConfig() });
  }
});

// Commands carry the tab they fired on; fall back to the active tab (e.g. commands with no tab
// context). Pages without the content script (chrome://) resolve to a typed error we can ignore.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!isCommandId(command)) {
    return;
  }

  const tabId = tab?.id ?? (await findActiveTabId());

  if (tabId === undefined) {
    return;
  }

  await sendToTab(tabId, { type: 'pixly/command', commandId: command });
});

async function findActiveTabId(): Promise<number | undefined> {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  return activeTab?.id;
}

// Capture requests from content scripts. Fails (with a typed error the tool surfaces) when
// activeTab is not currently granted for the tab — e.g. after a reload without reopening the popup.
chrome.runtime.onMessage.addListener(
  (message: ContentToBackgroundMessage, sender, sendResponse: (reply: CaptureReply) => void) => {
    if (message?.type !== 'pixly/capture-visible-tab') {
      return;
    }

    void captureVisibleTab(sender.tab?.windowId)
      .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Capture failed',
        }),
      );

    // Returning true keeps the message channel open for the async reply.
    return true;
  },
);

function captureVisibleTab(windowId: number | undefined): Promise<string> {
  const options: chrome.tabs.CaptureVisibleTabOptions = { format: 'png' };

  return windowId === undefined
    ? chrome.tabs.captureVisibleTab(options)
    : chrome.tabs.captureVisibleTab(windowId, options);
}
