import { createEmptyConfig } from '@shared/persistence/config-document';
import { STORAGE_ROOT_KEY } from '@shared/constants';

/**
 * MV3 service worker (spec §9). Coordinates extension-level concerns: seeds an empty config on
 * install so the popup and content scripts always read a valid document, and keeps the action
 * available on every tab. Per-page effects are handled entirely by the content script.
 */

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(STORAGE_ROOT_KEY);

  if (!existing[STORAGE_ROOT_KEY]) {
    await chrome.storage.local.set({ [STORAGE_ROOT_KEY]: createEmptyConfig() });
  }
});
