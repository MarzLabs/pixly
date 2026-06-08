import { STORAGE_ROOT_KEY } from '@shared/constants';
import type { PixlyConfig } from '@shared/types';
import { createEmptyConfig } from './config-document';

/**
 * Thin async wrapper over chrome.storage.local for the single {@link PixlyConfig} document.
 * All scope/tool mutations go through the pure helpers in config-document; this module only
 * handles the I/O boundary and change subscriptions.
 */

export async function loadConfig(): Promise<PixlyConfig> {
  const result = await chrome.storage.local.get(STORAGE_ROOT_KEY);
  const stored = result[STORAGE_ROOT_KEY] as PixlyConfig | undefined;

  return stored ?? createEmptyConfig();
}

export async function saveConfig(config: PixlyConfig): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_ROOT_KEY]: config });
}

/**
 * Subscribes to cross-context config changes (popup ↔ content) via chrome.storage.onChanged.
 * Returns an unsubscribe function. Preferred over runtime messaging for reactive state sync.
 */
export function onConfigChanged(listener: (config: PixlyConfig) => void): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== 'local' || !(STORAGE_ROOT_KEY in changes)) {
      return;
    }

    const next = changes[STORAGE_ROOT_KEY]?.newValue as PixlyConfig | undefined;
    listener(next ?? createEmptyConfig());
  };

  chrome.storage.onChanged.addListener(handler);

  return () => chrome.storage.onChanged.removeListener(handler);
}
