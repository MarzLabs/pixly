import { describe, expect, it } from 'vitest';
import { shouldHandleClick, type ClickGuardEvent } from './click-guard';

const PRIMARY_BUTTON = 0;
const MIDDLE_BUTTON = 1;
const SECONDARY_BUTTON = 2;

function buildEvent(overrides: Partial<ClickGuardEvent> = {}): ClickGuardEvent {
    return {
        button: PRIMARY_BUTTON,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
        ...overrides,
    };
}

describe('shouldHandleClick', () => {
    it('returns true for a plain primary-button click without modifiers', () => {
        // Arrange
        const event = buildEvent();

        // Act
        const result = shouldHandleClick(event);

        // Assert
        expect(result).toBe(true);
    });

    it('returns false when the shift key is held', () => {
        // Arrange
        const event = buildEvent({ shiftKey: true });

        // Act / Assert
        expect(shouldHandleClick(event)).toBe(false);
    });

    it('returns false when the ctrl key is held', () => {
        // Arrange
        const event = buildEvent({ ctrlKey: true });

        // Act / Assert
        expect(shouldHandleClick(event)).toBe(false);
    });

    it('returns false when the meta key is held', () => {
        // Arrange
        const event = buildEvent({ metaKey: true });

        // Act / Assert
        expect(shouldHandleClick(event)).toBe(false);
    });

    it('returns false when the alt key is held', () => {
        // Arrange
        const event = buildEvent({ altKey: true });

        // Act / Assert
        expect(shouldHandleClick(event)).toBe(false);
    });

    it('returns false for the middle mouse button', () => {
        // Arrange
        const event = buildEvent({ button: MIDDLE_BUTTON });

        // Act / Assert
        expect(shouldHandleClick(event)).toBe(false);
    });

    it('returns false for the secondary (right) mouse button', () => {
        // Arrange
        const event = buildEvent({ button: SECONDARY_BUTTON });

        // Act / Assert
        expect(shouldHandleClick(event)).toBe(false);
    });

    it('returns false when multiple modifiers are combined', () => {
        // Arrange
        const event = buildEvent({ shiftKey: true, ctrlKey: true });

        // Act / Assert
        expect(shouldHandleClick(event)).toBe(false);
    });

    it('accepts a native MouseEvent shape', () => {
        // Arrange — verifies structural-typing compatibility with DOM MouseEvent.
        const native = new MouseEvent('click', { button: PRIMARY_BUTTON });

        // Act / Assert
        expect(shouldHandleClick(native)).toBe(true);
    });
});
