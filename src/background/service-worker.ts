import { createEmptyConfig } from '@shared/persistence/config-document';
import { isCommandId, STORAGE_ROOT_KEY } from '@shared/constants';
import { sendToTab } from '@shared/messaging/send';

/**
 * MV3 service worker (spec §9). Coordinates extension-level concerns: seeds an empty config on
 * install so the popup and content scripts always read a valid document, and forwards keyboard
 * shortcuts (chrome.commands) to the tab's content script. Per-page effects are handled entirely
 * by the content script.
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
