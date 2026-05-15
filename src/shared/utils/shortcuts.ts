// Keyboard shortcut serialization, comparison and conflict detection.

import {
    type KeyboardShortcut,
    ModifierKey,
    type ModifierKeyValue,
    RESERVED_SHORTCUTS,
} from '../constants/shortcuts';

const SHORTCUT_SEPARATOR = '+';

export function normalizeShortcut(shortcut: KeyboardShortcut): KeyboardShortcut {
    const sortedModifiers = [...shortcut.modifiers].sort();

    return {
        modifiers: sortedModifiers,
        key: shortcut.key.toUpperCase(),
    };
}

export function shortcutToString(shortcut: KeyboardShortcut): string {
    const normalized = normalizeShortcut(shortcut);

    return [...normalized.modifiers, normalized.key].join(SHORTCUT_SEPARATOR);
}

export function shortcutsEqual(a: KeyboardShortcut, b: KeyboardShortcut): boolean {
    return shortcutToString(a) === shortcutToString(b);
}

export function matchesEvent(shortcut: KeyboardShortcut, event: KeyboardEvent): boolean {
    const eventModifiers: ModifierKeyValue[] = [];

    if (event.ctrlKey) eventModifiers.push(ModifierKey.Ctrl);
    if (event.shiftKey) eventModifiers.push(ModifierKey.Shift);
    if (event.altKey) eventModifiers.push(ModifierKey.Alt);
    if (event.metaKey) eventModifiers.push(ModifierKey.Meta);

    const eventShortcut: KeyboardShortcut = {
        modifiers: eventModifiers,
        key: event.key.length === 1 ? event.key.toUpperCase() : event.key,
    };

    return shortcutsEqual(shortcut, eventShortcut);
}

export function findShortcutConflict(
    candidate: KeyboardShortcut,
    existing: Record<string, KeyboardShortcut | null>,
    selfKey?: string,
): { source: 'reserved' | 'existing'; key?: string } | null {
    for (const reserved of RESERVED_SHORTCUTS) {
        if (shortcutsEqual(candidate, reserved)) {
            return { source: 'reserved' };
        }
    }

    for (const [key, shortcut] of Object.entries(existing)) {
        if (!shortcut || key === selfKey) {
            continue;
        }

        if (shortcutsEqual(candidate, shortcut)) {
            return { source: 'existing', key };
        }
    }

    return null;
}
