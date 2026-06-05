// Per-origin memory of which ambient tools were active, persisted in
// chrome.storage.session so it survives page reloads within a browsing session
// but is cleared when the browser closes.
//
// Only tools in SESSION_RESTORABLE_TOOLS are stored; any other id is filtered
// out on both read and write so a stale or unexpected value can never cause a
// modal/one-shot tool to auto-activate on load.
//
// Note: chrome.storage.session defaults to TRUSTED_CONTEXTS only. The service
// worker widens the access level to TRUSTED_AND_UNTRUSTED_CONTEXTS at startup
// so the content script can read and write this map.

import { StorageKey } from '../constants/storage';
import { SESSION_RESTORABLE_TOOLS, type ToolIdValue } from '../constants/tools';

type ActiveToolsByOrigin = Record<string, ToolIdValue[]>;

const RESTORABLE_TOOLS = new Set<ToolIdValue>(SESSION_RESTORABLE_TOOLS);

export function isSessionRestorableTool(toolId: ToolIdValue): boolean {
    return RESTORABLE_TOOLS.has(toolId);
}

function onlyRestorable(toolIds: readonly ToolIdValue[]): ToolIdValue[] {
    return toolIds.filter(isSessionRestorableTool);
}

async function readMap(): Promise<ActiveToolsByOrigin> {
    const stored = await chrome.storage.session.get(StorageKey.ActiveToolsByOrigin);
    const map = stored[StorageKey.ActiveToolsByOrigin] as unknown;

    if (typeof map !== 'object' || map === null) {
        return {};
    }

    return map as ActiveToolsByOrigin;
}

export async function loadActiveToolsForOrigin(origin: string): Promise<ToolIdValue[]> {
    const map = await readMap();
    const toolIds = map[origin];

    return Array.isArray(toolIds) ? onlyRestorable(toolIds) : [];
}

export async function saveActiveToolsForOrigin(
    origin: string,
    toolIds: readonly ToolIdValue[],
): Promise<void> {
    const map = await readMap();
    const restorable = onlyRestorable(toolIds);

    if (restorable.length === 0) {
        // Keep the map tidy: an empty origin entry carries no information.
        delete map[origin];
    } else {
        map[origin] = restorable;
    }

    await chrome.storage.session.set({ [StorageKey.ActiveToolsByOrigin]: map });
}
