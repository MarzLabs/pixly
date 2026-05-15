import { describe, expect, it } from 'vitest';
import { ModifierKey, type KeyboardShortcut } from '@/shared/constants/shortcuts';
import { findShortcutConflict, matchesEvent, normalizeShortcut, shortcutsEqual, shortcutToString } from './shortcuts';

describe('normalizeShortcut', () => {
    it('sorts modifiers and upper-cases the key', () => {
        // Arrange
        const shortcut: KeyboardShortcut = { modifiers: [ModifierKey.Shift, ModifierKey.Alt], key: 'i' };

        // Act
        const normalized = normalizeShortcut(shortcut);

        // Assert
        expect(normalized.modifiers).toEqual(['Alt', 'Shift']);
        expect(normalized.key).toBe('I');
    });
});

describe('shortcutToString', () => {
    it('produces a stable string representation', () => {
        // Arrange / Act / Assert
        expect(shortcutToString({ modifiers: [ModifierKey.Ctrl, ModifierKey.Shift], key: 'A' })).toBe('Ctrl+Shift+A');
        expect(shortcutToString({ modifiers: [ModifierKey.Shift, ModifierKey.Ctrl], key: 'a' })).toBe('Ctrl+Shift+A');
    });
});

describe('shortcutsEqual', () => {
    it('treats normalized equivalents as equal', () => {
        // Arrange
        const a: KeyboardShortcut = { modifiers: [ModifierKey.Alt, ModifierKey.Shift], key: 'b' };
        const b: KeyboardShortcut = { modifiers: [ModifierKey.Shift, ModifierKey.Alt], key: 'B' };

        // Act / Assert
        expect(shortcutsEqual(a, b)).toBe(true);
    });
});

describe('matchesEvent', () => {
    it('matches a KeyboardEvent when modifiers and key align', () => {
        // Arrange
        const event = new KeyboardEvent('keydown', {
            key: 'I',
            altKey: true,
        });

        // Act / Assert
        expect(matchesEvent({ modifiers: [ModifierKey.Alt], key: 'I' }, event)).toBe(true);
        expect(matchesEvent({ modifiers: [ModifierKey.Ctrl], key: 'I' }, event)).toBe(false);
    });
});

describe('findShortcutConflict', () => {
    it('flags conflicts against the reserved shortcuts list', () => {
        // Arrange
        const candidate: KeyboardShortcut = { modifiers: [ModifierKey.Ctrl], key: 'T' };

        // Act
        const conflict = findShortcutConflict(candidate, {});

        // Assert
        expect(conflict?.source).toBe('reserved');
    });

    it('flags conflicts against existing user shortcuts', () => {
        // Arrange
        const existing = {
            'tool-a': { modifiers: [ModifierKey.Alt], key: 'I' } as KeyboardShortcut,
        };
        const candidate: KeyboardShortcut = { modifiers: [ModifierKey.Alt], key: 'i' };

        // Act
        const conflict = findShortcutConflict(candidate, existing);

        // Assert
        expect(conflict?.source).toBe('existing');
        expect(conflict?.key).toBe('tool-a');
    });

    it('ignores the candidate against its own slot', () => {
        // Arrange
        const existing = {
            'tool-a': { modifiers: [ModifierKey.Alt], key: 'I' } as KeyboardShortcut,
        };
        const candidate: KeyboardShortcut = { modifiers: [ModifierKey.Alt], key: 'I' };

        // Act
        const conflict = findShortcutConflict(candidate, existing, 'tool-a');

        // Assert
        expect(conflict).toBeNull();
    });
});
