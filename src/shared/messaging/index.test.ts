import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendMessageToRuntime, sendMessageToTab } from './index';
import type { MessageOf } from './index';
import { MessageType } from '../types/messages';

// ---------------------------------------------------------------------------
// Chrome API stubs — jsdom does not provide the chrome namespace.
// ---------------------------------------------------------------------------

const mockSendMessage = vi.fn<() => Promise<unknown>>();
const mockTabsSendMessage = vi.fn<() => Promise<unknown>>();

beforeEach(() => {
    vi.stubGlobal('chrome', {
        runtime: { sendMessage: mockSendMessage },
        tabs: { sendMessage: mockTabsSendMessage },
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

const SAMPLE_TAB_ID = 42;

function buildToggleMessage(): MessageOf<typeof MessageType.ToggleTool> {
    return { type: MessageType.ToggleTool, payload: { toolId: 'inspector', enabled: true } };
}

function buildGetActiveToolsMessage(): MessageOf<typeof MessageType.GetActiveTools> {
    return { type: MessageType.GetActiveTools, payload: undefined };
}

// ---------------------------------------------------------------------------
// sendMessageToTab
// ---------------------------------------------------------------------------

describe('sendMessageToTab', () => {
    it('returns the response when the content script is reachable', async () => {
        // Arrange
        const expected = { payload: { activeTools: ['inspector'] } };
        mockTabsSendMessage.mockResolvedValue(expected);

        // Act
        const result = await sendMessageToTab(SAMPLE_TAB_ID, buildGetActiveToolsMessage());

        // Assert
        expect(result).toEqual(expected);
    });

    it('returns undefined (no throw) when the content script is not installed — "Could not establish connection"', async () => {
        // Arrange — this is the exact error Chrome throws on restricted pages.
        mockTabsSendMessage.mockRejectedValue(
            new Error('Could not establish connection. Receiving end does not exist.'),
        );

        // Act
        const result = await sendMessageToTab(SAMPLE_TAB_ID, buildToggleMessage());

        // Assert — must be silently swallowed, not re-thrown.
        expect(result).toBeUndefined();
    });

    it('returns undefined (no throw) when the rejection uses the short variant — "Receiving end does not exist"', async () => {
        // Arrange
        mockTabsSendMessage.mockRejectedValue(new Error('Receiving end does not exist'));

        // Act / Assert
        await expect(sendMessageToTab(SAMPLE_TAB_ID, buildToggleMessage())).resolves.toBeUndefined();
    });

    it('returns undefined and logs a warning for unexpected errors', async () => {
        // Arrange
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        mockTabsSendMessage.mockRejectedValue(new Error('Extension context invalidated.'));

        // Act
        const result = await sendMessageToTab(SAMPLE_TAB_ID, buildToggleMessage());

        // Assert — unexpected error must be warned about, not silently dropped.
        expect(result).toBeUndefined();
        expect(warnSpy).toHaveBeenCalledOnce();
        expect(warnSpy.mock.calls[0][0]).toContain('[Pixly]');
    });
});

// ---------------------------------------------------------------------------
// sendMessageToRuntime
// ---------------------------------------------------------------------------

describe('sendMessageToRuntime', () => {
    it('returns the response when the service worker is reachable', async () => {
        // Arrange
        const expected = { type: MessageType.TakeSnapshotResponse, payload: { dataUrl: 'data:image/png;base64,abc' } };
        mockSendMessage.mockResolvedValue(expected);

        // Act
        const result = await sendMessageToRuntime(buildGetActiveToolsMessage());

        // Assert
        expect(result).toEqual(expected);
    });

    it('returns undefined (no throw) for "Could not establish connection" from runtime', async () => {
        // Arrange
        mockSendMessage.mockRejectedValue(
            new Error('Could not establish connection. Receiving end does not exist.'),
        );

        // Act / Assert
        await expect(sendMessageToRuntime(buildGetActiveToolsMessage())).resolves.toBeUndefined();
    });

    it('returns undefined and logs a warning for unexpected runtime errors', async () => {
        // Arrange
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        mockSendMessage.mockRejectedValue(new Error('Some unexpected runtime error'));

        // Act
        const result = await sendMessageToRuntime(buildGetActiveToolsMessage());

        // Assert
        expect(result).toBeUndefined();
        expect(warnSpy).toHaveBeenCalledOnce();
        expect(warnSpy.mock.calls[0][0]).toContain('[Pixly]');
    });
});
