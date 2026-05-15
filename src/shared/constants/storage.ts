// Keys used to read/write from chrome.storage.local.

export const StorageKey = {
    Settings: 'pixly:settings',
    ActiveTools: 'pixly:active-tools',
    OverlayState: 'pixly:overlay-state',
} as const;

export type StorageKeyValue = (typeof StorageKey)[keyof typeof StorageKey];
