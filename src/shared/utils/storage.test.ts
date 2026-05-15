import { describe, expect, it } from 'vitest';
import { migrateSettings } from './storage';
import { SETTINGS_SCHEMA_VERSION } from '../constants/ui';
import type { UserSettings } from '../types/settings';

describe('migrateSettings', () => {
    it('returns defaults when stored blob is empty', () => {
        // Arrange
        const stored: Partial<UserSettings> = {};

        // Act
        const { settings, log } = migrateSettings(stored);

        // Assert
        expect(settings.version).toBe(SETTINGS_SCHEMA_VERSION);
        expect(settings.snap.thresholdPx).toBeGreaterThan(0);
        expect(settings.inspectorPanel.side).toBe('right');
        expect(log.length).toBeGreaterThan(0);
    });

    it('preserves v1 palette and shortcuts during migration', () => {
        // Arrange
        const stored = {
            palette: ['#AABBCC'],
            shortcuts: { 'inspector': { modifiers: ['Alt'], key: 'I' } } as unknown as UserSettings['shortcuts'],
            selectedPaletteColor: '#AABBCC',
        } as Partial<UserSettings>;

        // Act
        const { settings } = migrateSettings(stored);

        // Assert
        expect(settings.palette).toContain('#AABBCC');
        expect(settings.shortcuts.inspector).toEqual({ modifiers: ['Alt'], key: 'I' });
        expect(settings.selectedPaletteColor).toBe('#AABBCC');
    });

    it('does not log migration when stored already has current version', () => {
        // Arrange
        const stored: Partial<UserSettings> = {
            version: SETTINGS_SCHEMA_VERSION,
            palette: ['#112233'],
        };

        // Act
        const { settings, log } = migrateSettings(stored);

        // Assert
        expect(log).toEqual([]);
        expect(settings.version).toBe(SETTINGS_SCHEMA_VERSION);
        expect(settings.palette).toContain('#112233');
    });

    it('fills missing v2 fields with safe defaults', () => {
        // Arrange
        const stored: Partial<UserSettings> = {
            palette: ['#FF0000'],
            // Intentionally missing snap, inspectorPanel, multiSelection.
        };

        // Act
        const { settings } = migrateSettings(stored);

        // Assert
        expect(settings.snap.enabled).toBe(true);
        expect(settings.inspectorPanel.side).toBe('right');
        expect(settings.multiSelection.maxItems).toBeGreaterThan(0);
    });

    it('drops shortcut entries for removed tools without logging a migration message', () => {
        // Arrange — simulate a v2 install that still has the legacy
        // CaptureSpecs shortcut persisted from before its removal.
        const stored: Partial<UserSettings> = {
            version: SETTINGS_SCHEMA_VERSION,
            shortcuts: {
                'capture-specs': { modifiers: ['Alt'], key: 'S' },
                inspector: { modifiers: ['Alt'], key: 'I' },
            } as unknown as UserSettings['shortcuts'],
        };

        // Act
        const { settings, log, mutated } = migrateSettings(stored);

        // Assert
        expect(mutated).toBe(true);
        expect(log).toEqual([]);
        expect((settings.shortcuts as Record<string, unknown>)['capture-specs']).toBeUndefined();
        expect(settings.shortcuts.inspector).toEqual({ modifiers: ['Alt'], key: 'I' });
    });

    it('reports mutated=false when no orphan shortcut is present', () => {
        // Arrange
        const stored: Partial<UserSettings> = {
            version: SETTINGS_SCHEMA_VERSION,
            shortcuts: {
                inspector: { modifiers: ['Alt'], key: 'I' },
            } as unknown as UserSettings['shortcuts'],
        };

        // Act
        const { mutated } = migrateSettings(stored);

        // Assert
        expect(mutated).toBe(false);
    });

    it('returns a fully populated UserSettings when v1 data has no v2 fields', () => {
        // Arrange — simulate settings from v1 (no version field, no v2 fields)
        const v1Stored = {
            palette: ['#AABBCC', '#112233'],
            shortcuts: {},
            grid: { columns: 6, gutterPx: 8, maxWidthPx: 960, color: '#000000', opacity: 0.2 },
            magnifier: { sizePx: 160, zoomLevel: 3 },
            measurementUnit: 'rem',
            overlay: { opacity: 0.7, blendMode: 'screen' },
            selectedPaletteColor: '#AABBCC',
        } as Partial<UserSettings>;

        // Act
        const { settings } = migrateSettings(v1Stored);

        // Assert — v1 fields are preserved
        expect(settings.palette).toEqual(['#AABBCC', '#112233']);
        expect(settings.measurementUnit).toBe('rem');
        expect(settings.overlay.blendMode).toBe('screen');
        expect(settings.selectedPaletteColor).toBe('#AABBCC');

        // Assert — v2 fields are filled with defaults
        expect(settings.snap).toBeDefined();
        expect(settings.snap.enabled).toBe(true);
        expect(settings.snap.thresholdPx).toBeGreaterThan(0);
        expect(settings.inspectorPanel).toBeDefined();
        expect(settings.inspectorPanel.side).toBe('right');
        expect(settings.inspectorPanel.hideFloatingTooltip).toBe(false);
        expect(settings.multiSelection).toBeDefined();
        expect(settings.multiSelection.maxItems).toBeGreaterThan(0);
        expect(settings.showWelcomeMessage).toBe(true);
        expect(settings.migrationLog.length).toBeGreaterThan(0);
        expect(settings.version).toBe(SETTINGS_SCHEMA_VERSION);
    });
});
