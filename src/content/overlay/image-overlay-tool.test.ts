// Regression tests for ImageOverlayTool async behaviour.
//
// The tests here cover race conditions that require faking Chrome APIs and
// simulating interleaved async operations. They do NOT exercise rendering or
// DOM layout (jsdom has no box model), so assertions focus on state and
// container-count invariants rather than pixel positions.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImageOverlayTool } from './image-overlay-tool';
import type { ToolContext } from '../tools/tool';
import type { UserSettings } from '@/shared/types/settings';
import { StorageKey } from '@/shared/constants/storage';
import { MessageType } from '@/shared/types/messages';

// Minimal settings object that satisfies the ToolContext.settings type.
const STUB_SETTINGS: UserSettings = {
    version: 2,
    palette: [],
    shortcuts: {} as UserSettings['shortcuts'],
    grid: { columns: 12, gutterPx: 16, maxWidthPx: 1200, color: '#ff00ff', opacity: 0.15 },
    magnifier: { sizePx: 180, zoomLevel: 2 },
    measurementUnit: 'px',
    overlay: { opacity: 0.5, blendMode: 'normal' },
    selectedPaletteColor: null,
    snap: { enabled: true, thresholdPx: 5 },
    inspectorPanel: { side: 'right', hideFloatingTooltip: false },
    multiSelection: { maxItems: 10 },
    distanceLine: { color: '#F97316' },
    brokenImages: { backgroundColor: '#E4E4E7', urlMaxChars: 40 },
    showWelcomeMessage: false,
    migrationLog: [],
};

function makeContext(settings: UserSettings = STUB_SETTINGS): ToolContext {
    return {
        get settings() {
            return settings;
        },
        showNotification: vi.fn(),
        onSettingsChange: vi.fn().mockReturnValue(() => undefined),
    };
}

// A minimal PersistedOverlayState stored in chrome.storage.local.
const PERSISTED_STATE = {
    dataUrl: 'data:image/png;base64,abc',
    naturalWidth: 100,
    naturalHeight: 100,
    width: 100,
    height: 100,
    positionX: 0,
    positionY: 0,
    locked: false,
};

describe('ImageOverlayTool — restorePersistedState TOCTOU guard', () => {
    let storageGet: ReturnType<typeof vi.fn>;
    let storageSet: ReturnType<typeof vi.fn>;
    let storageRemove: ReturnType<typeof vi.fn>;
    let runtimeSendMessage: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        // Stub chrome APIs used by ImageOverlayTool.
        storageGet = vi.fn();
        storageSet = vi.fn().mockResolvedValue(undefined);
        storageRemove = vi.fn().mockResolvedValue(undefined);
        runtimeSendMessage = vi.fn().mockResolvedValue(undefined);

        vi.stubGlobal('chrome', {
            storage: {
                local: {
                    get: storageGet,
                    set: storageSet,
                    remove: storageRemove,
                },
            },
            runtime: {
                sendMessage: runtimeSendMessage,
            },
        });

        // Stub window dimensions so clampToViewport has a finite boundary.
        vi.stubGlobal('innerWidth', 1280);
        vi.stubGlobal('innerHeight', 800);
    });

    afterEach(() => {
        vi.restoreAllMocks();
        vi.unstubAllGlobals();

        // Clean up any overlay containers appended to document.body.
        document
            .querySelectorAll('.pixly-image-overlay')
            .forEach((el) => el.remove());
    });

    it('mounts only one container when loadImage is called during the restorePersistedState storage read', async () => {
        // Arrange — storageGet returns persisted data but resolves only after
        // we manually trigger it, so we can interleave loadImage() in between.
        let resolveStorageGet!: (value: Record<string, unknown>) => void;

        storageGet.mockImplementation(() =>
            new Promise<Record<string, unknown>>((resolve) => {
                resolveStorageGet = resolve;
            }),
        );

        const tool = new ImageOverlayTool();
        const context = makeContext();

        // Enable the tool — this starts restorePersistedState() which awaits
        // the storage read. The promise is now pending.
        tool.enable(context);

        // While the storage read is pending, simulate the popup sending
        // LoadOverlayImage: call loadImage() directly on the tool.
        // This mimics the TOCTOU race: loadImage() sets this.state before
        // restorePersistedState() resumes.
        tool.loadImage('data:image/png;base64,NEW', 200, 150);

        // Act — now resolve the pending storage read with old persisted data.
        // restorePersistedState() should detect this.state is already set and
        // bail out without calling mountOverlay() again.
        resolveStorageGet({ [StorageKey.OverlayState]: PERSISTED_STATE });

        // Wait for the microtask queue to flush so restorePersistedState() runs.
        await Promise.resolve();
        await Promise.resolve();

        // Assert — only one overlay container must be in the DOM.
        const containers = document.querySelectorAll('.pixly-image-overlay');

        expect(containers.length).toBe(1);
    });

    it('mounts the restored container when no concurrent loadImage is present', async () => {
        // Arrange — no race: storage resolves immediately with persisted data.
        storageGet.mockResolvedValue({ [StorageKey.OverlayState]: PERSISTED_STATE });

        const tool = new ImageOverlayTool();
        const context = makeContext();

        // Act
        tool.enable(context);

        // Allow all microtasks to settle.
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        // Assert — one container mounted from persisted state.
        const containers = document.querySelectorAll('.pixly-image-overlay');

        expect(containers.length).toBe(1);
    });

    it('does not mount any container when there is no persisted state', async () => {
        // Arrange — storage has no overlay data.
        storageGet.mockResolvedValue({});

        const tool = new ImageOverlayTool();
        const context = makeContext();

        // Act
        tool.enable(context);

        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        // Assert — no containers.
        const containers = document.querySelectorAll('.pixly-image-overlay');

        expect(containers.length).toBe(0);
    });

    it('broadcasts OverlayStateChanged exactly once after a TOCTOU-guarded restore', async () => {
        // Arrange — simulate the race: storage resolves after loadImage has run.
        let resolveStorageGet!: (value: Record<string, unknown>) => void;

        storageGet.mockImplementation(() =>
            new Promise<Record<string, unknown>>((resolve) => {
                resolveStorageGet = resolve;
            }),
        );

        const tool = new ImageOverlayTool();
        const context = makeContext();

        tool.enable(context);

        // Simulate concurrent loadImage during the storage-read gap.
        tool.loadImage('data:image/png;base64,NEW', 200, 150);

        // Count broadcasts before resolving the storage read.
        const callsBefore = runtimeSendMessage.mock.calls.filter(
            (call) => (call[0] as { type: string }).type === MessageType.OverlayStateChanged,
        ).length;

        resolveStorageGet({ [StorageKey.OverlayState]: PERSISTED_STATE });

        await Promise.resolve();
        await Promise.resolve();

        // Act — count broadcasts after the storage read resolves.
        const callsAfter = runtimeSendMessage.mock.calls.filter(
            (call) => (call[0] as { type: string }).type === MessageType.OverlayStateChanged,
        ).length;

        // Assert — restorePersistedState() must not emit a second broadcast
        // because it bailed out before calling mountOverlay().
        expect(callsAfter - callsBefore).toBe(0);
    });
});
