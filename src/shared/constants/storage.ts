// Keys used to read/write from chrome.storage. Most live in `local` (persisted
// across restarts); `ActiveToolsByOrigin` lives in `session` so it is cleared
// when the browser closes.

export const StorageKey = {
    Settings: 'pixly:settings',
    OverlayState: 'pixly:overlay-state',
    // Map of origin → active ambient tool ids, kept in chrome.storage.session.
    ActiveToolsByOrigin: 'pixly:active-tools-by-origin',
} as const;

export type StorageKeyValue = (typeof StorageKey)[keyof typeof StorageKey];
