// Type-safe wrapper around chrome.storage.local with sensible defaults and
// in-place migration from v1 (no `version` field) to v2 (numbered schema).

import { DEFAULT_SHORTCUTS } from '../constants/shortcuts';
import { StorageKey } from '../constants/storage';
import {
    DEFAULT_PALETTE,
    DISTANCE_LINE_DEFAULTS,
    GRID_DEFAULTS,
    IMAGE_OVERLAY_DEFAULTS,
    INSPECTOR_PANEL_DEFAULTS,
    MAGNIFIER_DEFAULTS,
    MULTI_SELECTION_DEFAULTS,
    SETTINGS_SCHEMA_VERSION,
    SNAP_DEFAULTS,
} from '../constants/ui';
import type {
    InspectorPanelSide,
    MigrationLogEntry,
    UserSettings,
} from '../types/settings';

const V1_SCHEMA_VERSION = 1;
const MIGRATION_LOG_MAX_ENTRIES = 20;

// Tool identifiers that existed in past versions of the extension but were
// later removed. Their stored shortcut entries are stripped silently on load
// so they don't leak into the in-memory settings or conflict checks.
const REMOVED_SHORTCUT_KEYS: readonly string[] = ['capture-specs'];

export const DEFAULT_SETTINGS: UserSettings = {
    version: SETTINGS_SCHEMA_VERSION,
    palette: [...DEFAULT_PALETTE],
    shortcuts: { ...DEFAULT_SHORTCUTS },
    grid: { ...GRID_DEFAULTS },
    magnifier: { sizePx: MAGNIFIER_DEFAULTS.sizePx, zoomLevel: MAGNIFIER_DEFAULTS.zoomLevel },
    measurementUnit: 'px',
    overlay: { opacity: IMAGE_OVERLAY_DEFAULTS.opacity, blendMode: IMAGE_OVERLAY_DEFAULTS.blendMode },
    selectedPaletteColor: null,
    snap: {
        enabled: SNAP_DEFAULTS.enabled,
        thresholdPx: SNAP_DEFAULTS.thresholdPx,
    },
    inspectorPanel: {
        side: INSPECTOR_PANEL_DEFAULTS.side as InspectorPanelSide,
        hideFloatingTooltip: INSPECTOR_PANEL_DEFAULTS.hideFloatingTooltip,
    },
    multiSelection: {
        maxItems: MULTI_SELECTION_DEFAULTS.maxItems,
    },
    distanceLine: {
        color: DISTANCE_LINE_DEFAULTS.color,
    },
    showWelcomeMessage: true,
    migrationLog: [],
};

export async function loadSettings(): Promise<UserSettings> {
    const stored = await chrome.storage.local.get(StorageKey.Settings);
    const value = stored[StorageKey.Settings] as Partial<UserSettings> | undefined;

    if (!value) {
        return cloneDefaults();
    }

    const { settings, log, mutated } = migrateSettings(value);

    if (log.length > 0 || mutated) {
        await saveSettings(settings);
    }

    return settings;
}

export async function saveSettings(settings: UserSettings): Promise<void> {
    await chrome.storage.local.set({ [StorageKey.Settings]: settings });
}

export async function patchSettings(patch: Partial<UserSettings>): Promise<UserSettings> {
    const current = await loadSettings();
    const merged: UserSettings = { ...current, ...patch };
    await saveSettings(merged);

    return merged;
}

// Merge a stored blob with the defaults, upgrading the schema as needed.
// Returns the migration log and a `mutated` flag for orphan cleanups that
// should be persisted but do not warrant a user-visible log entry.
export function migrateSettings(
    stored: Partial<UserSettings>,
): { settings: UserSettings; log: MigrationLogEntry[]; mutated: boolean } {
    const defaults = cloneDefaults();
    const log: MigrationLogEntry[] = [...(stored.migrationLog ?? [])];
    const incomingVersion = typeof stored.version === 'number' ? stored.version : V1_SCHEMA_VERSION;

    if (incomingVersion < SETTINGS_SCHEMA_VERSION) {
        log.push({
            timestamp: Date.now(),
            message: `Settings migrated from v${incomingVersion} to v${SETTINGS_SCHEMA_VERSION}.`,
        });
    }

    const { shortcuts: filteredShortcuts, removed: removedShortcutCount } = stripRemovedShortcutKeys(stored.shortcuts);

    // Per-field merging keeps v1 values intact and fills any new v2 field with
    // the default when missing — this is what guarantees no silent reset.
    const merged: UserSettings = {
        version: SETTINGS_SCHEMA_VERSION,
        palette: Array.isArray(stored.palette) && stored.palette.length > 0
            ? [...stored.palette]
            : [...defaults.palette],
        shortcuts: { ...defaults.shortcuts, ...filteredShortcuts },
        grid: { ...defaults.grid, ...(stored.grid ?? {}) },
        magnifier: { ...defaults.magnifier, ...(stored.magnifier ?? {}) },
        measurementUnit: stored.measurementUnit ?? defaults.measurementUnit,
        overlay: { ...defaults.overlay, ...(stored.overlay ?? {}) },
        selectedPaletteColor: stored.selectedPaletteColor ?? null,
        snap: { ...defaults.snap, ...(stored.snap ?? {}) },
        inspectorPanel: { ...defaults.inspectorPanel, ...(stored.inspectorPanel ?? {}) },
        multiSelection: { ...defaults.multiSelection, ...(stored.multiSelection ?? {}) },
        distanceLine: { ...defaults.distanceLine, ...(stored.distanceLine ?? {}) },
        showWelcomeMessage: stored.showWelcomeMessage ?? defaults.showWelcomeMessage,
        migrationLog: trimLog(log),
    };

    return { settings: merged, log, mutated: removedShortcutCount > 0 };
}

export async function appendMigrationLog(message: string): Promise<void> {
    const settings = await loadSettings();
    settings.migrationLog = trimLog([
        ...settings.migrationLog,
        { timestamp: Date.now(), message },
    ]);
    await saveSettings(settings);
}

function cloneDefaults(): UserSettings {
    return {
        ...DEFAULT_SETTINGS,
        palette: [...DEFAULT_SETTINGS.palette],
        shortcuts: { ...DEFAULT_SETTINGS.shortcuts },
        grid: { ...DEFAULT_SETTINGS.grid },
        magnifier: { ...DEFAULT_SETTINGS.magnifier },
        overlay: { ...DEFAULT_SETTINGS.overlay },
        snap: { ...DEFAULT_SETTINGS.snap },
        inspectorPanel: { ...DEFAULT_SETTINGS.inspectorPanel },
        multiSelection: { ...DEFAULT_SETTINGS.multiSelection },
        distanceLine: { ...DEFAULT_SETTINGS.distanceLine },
        migrationLog: [],
    };
}

function trimLog(log: MigrationLogEntry[]): MigrationLogEntry[] {
    if (log.length <= MIGRATION_LOG_MAX_ENTRIES) {
        return log;
    }

    return log.slice(log.length - MIGRATION_LOG_MAX_ENTRIES);
}

// Drop entries that belong to tool IDs that no longer exist. This keeps the
// in-memory settings shape clean even if older installs still have the keys
// persisted in chrome.storage.local. Returns the filtered map together with
// the count of removed entries so the caller can decide to resave.
function stripRemovedShortcutKeys(
    shortcuts: UserSettings['shortcuts'] | undefined,
): { shortcuts: Partial<UserSettings['shortcuts']>; removed: number } {
    if (!shortcuts) {
        return { shortcuts: {}, removed: 0 };
    }

    const filtered: Record<string, unknown> = {};
    let removed = 0;

    for (const [key, value] of Object.entries(shortcuts)) {
        if (REMOVED_SHORTCUT_KEYS.includes(key)) {
            removed += 1;

            continue;
        }

        filtered[key] = value;
    }

    return { shortcuts: filtered as Partial<UserSettings['shortcuts']>, removed };
}
