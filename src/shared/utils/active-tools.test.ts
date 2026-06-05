import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    isSessionRestorableTool,
    loadActiveToolsForOrigin,
    saveActiveToolsForOrigin,
} from './active-tools';
import { StorageKey } from '../constants/storage';
import { ToolId } from '../constants/tools';

const KEY = StorageKey.ActiveToolsByOrigin;
const ORIGIN_A = 'https://a.example';
const ORIGIN_B = 'https://b.example';

describe('active-tools session storage', () => {
    let store: Record<string, unknown>;

    beforeEach(() => {
        store = {};

        vi.stubGlobal('chrome', {
            storage: {
                session: {
                    get: vi.fn(async (key: string) => (key in store ? { [key]: store[key] } : {})),
                    set: vi.fn(async (items: Record<string, unknown>) => {
                        Object.assign(store, items);
                    }),
                },
            },
        });
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('persists only restorable tools under the origin key', async () => {
        // Act — mix restorable tools with an excluded one (Snapshot).
        await saveActiveToolsForOrigin(ORIGIN_A, [
            ToolId.BrokenImages,
            ToolId.Snapshot,
            ToolId.GridOverlay,
        ]);

        // Assert — Snapshot is dropped, the rest are kept in order.
        expect(store[KEY]).toEqual({ [ORIGIN_A]: [ToolId.BrokenImages, ToolId.GridOverlay] });
    });

    it('filters unknown or non-restorable ids when loading', async () => {
        // Arrange
        store[KEY] = { [ORIGIN_A]: [ToolId.BrokenImages, 'bogus-tool', ToolId.Snapshot] };

        // Act
        const result = await loadActiveToolsForOrigin(ORIGIN_A);

        // Assert
        expect(result).toEqual([ToolId.BrokenImages]);
    });

    it('returns an empty array for an origin with no memory', async () => {
        // Arrange
        store[KEY] = { [ORIGIN_B]: [ToolId.Rulers] };

        // Act
        const result = await loadActiveToolsForOrigin(ORIGIN_A);

        // Assert
        expect(result).toEqual([]);
    });

    it('removes the origin entry when the restorable set becomes empty', async () => {
        // Arrange
        store[KEY] = { [ORIGIN_A]: [ToolId.BrokenImages], [ORIGIN_B]: [ToolId.Rulers] };

        // Act — only excluded tools remain active for ORIGIN_A.
        await saveActiveToolsForOrigin(ORIGIN_A, [ToolId.ImageOverlay, ToolId.Snapshot]);

        // Assert — ORIGIN_A is dropped, ORIGIN_B is untouched.
        expect(store[KEY]).toEqual({ [ORIGIN_B]: [ToolId.Rulers] });
    });

    it('remembers almost every tool, excluding only the special cases', () => {
        // Assert — most tools are restorable, including interactive modes.
        expect(isSessionRestorableTool(ToolId.BrokenImages)).toBe(true);
        expect(isSessionRestorableTool(ToolId.Inspector)).toBe(true);
        expect(isSessionRestorableTool(ToolId.ColorPicker)).toBe(true);
        expect(isSessionRestorableTool(ToolId.Magnifier)).toBe(true);

        // Excluded: own-persistence overlay and the one-shot snapshot action.
        expect(isSessionRestorableTool(ToolId.ImageOverlay)).toBe(false);
        expect(isSessionRestorableTool(ToolId.Snapshot)).toBe(false);
    });
});
