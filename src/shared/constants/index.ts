/** Stable tool identifiers. Used as persistence keys and registry keys. */
export const TOOL_ID = {
  fixBrokenImages: 'fix-broken-images',
  imageOverlay: 'image-overlay',
  globalOutlines: 'global-outlines',
} as const;

export type ToolId = (typeof TOOL_ID)[keyof typeof TOOL_ID];

/** Attribute and id namespacing so Pixly never collides with the host page. */
export const PIXLY_NAMESPACE = 'pixly';
export const SHADOW_HOST_ID = 'pixly-shadow-host';

/** Data-attribute prefix used to stash original `<img>` attributes for reversibility. */
export const PIXLY_DATA_PREFIX = 'data-pixly-';

/** Marks an element as already processed so re-runs stay idempotent (MV3 re-injection safe). */
export const PROCESSED_MARKER_ATTR = `${PIXLY_DATA_PREFIX}processed`;

/** chrome.storage.local key under which all Pixly config lives. */
export const STORAGE_ROOT_KEY = 'pixly:v1';

/** IndexedDB database and object store for overlay binaries. */
export const OVERLAY_DB_NAME = 'pixly-overlays';
export const OVERLAY_DB_VERSION = 1;
export const OVERLAY_STORE_NAME = 'overlay-images';

/** Highest z-index Pixly is willing to use for its viewport-anchored UI. */
export const PIXLY_MAX_Z_INDEX = 2147483646;

/**
 * chrome.commands identifiers. Keys in the manifest `commands` block and payloads of
 * `chrome.commands.onCommand`, forwarded to the content script as `pixly/command` messages.
 */
export const COMMAND_ID = {
  toggleToolbar: 'pixly-toggle-toolbar',
  toggleOverlay: 'pixly-toggle-overlay',
} as const;

export type CommandId = (typeof COMMAND_ID)[keyof typeof COMMAND_ID];

export function isCommandId(value: string): value is CommandId {
  return (Object.values(COMMAND_ID) as string[]).includes(value);
}
