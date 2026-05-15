// Keyboard shortcut definitions and modifier handling.

import { ToolId, type ToolIdValue } from './tools';

export const ModifierKey = {
    Ctrl: 'Ctrl',
    Shift: 'Shift',
    Alt: 'Alt',
    Meta: 'Meta',
} as const;

export type ModifierKeyValue = (typeof ModifierKey)[keyof typeof ModifierKey];

export interface KeyboardShortcut {
    modifiers: ModifierKeyValue[];
    key: string;
}

// Default shortcuts. Use combinations unlikely to clash with Chrome defaults.
export const DEFAULT_SHORTCUTS: Record<ToolIdValue, KeyboardShortcut | null> = {
    [ToolId.Inspector]: { modifiers: [ModifierKey.Alt], key: 'I' },
    [ToolId.Typography]: { modifiers: [ModifierKey.Alt], key: 'T' },
    [ToolId.ColorPicker]: { modifiers: [ModifierKey.Alt], key: 'C' },
    [ToolId.GlobalOutlines]: { modifiers: [ModifierKey.Alt, ModifierKey.Shift], key: 'O' },
    [ToolId.InspectSpacing]: { modifiers: [ModifierKey.Alt, ModifierKey.Shift], key: 'P' },
    [ToolId.GridOverlay]: { modifiers: [ModifierKey.Alt], key: 'G' },
    [ToolId.Rulers]: { modifiers: [ModifierKey.Alt], key: 'R' },
    [ToolId.DistanceMeter]: { modifiers: [ModifierKey.Alt], key: 'D' },
    [ToolId.Magnifier]: { modifiers: [ModifierKey.Alt], key: 'L' },
    [ToolId.ImageOverlay]: { modifiers: [ModifierKey.Alt], key: 'O' },
    [ToolId.Snapshot]: { modifiers: [ModifierKey.Alt, ModifierKey.Shift], key: 'S' },
    [ToolId.FreeGuides]: { modifiers: [ModifierKey.Alt, ModifierKey.Shift], key: 'R' },
    [ToolId.InspectorPanel]: { modifiers: [ModifierKey.Alt], key: 'P' },
};

// Shortcuts the user must avoid because they clash with the browser or OS.
export const RESERVED_SHORTCUTS: KeyboardShortcut[] = [
    { modifiers: [ModifierKey.Ctrl], key: 'T' },
    { modifiers: [ModifierKey.Ctrl], key: 'W' },
    { modifiers: [ModifierKey.Ctrl], key: 'N' },
    { modifiers: [ModifierKey.Ctrl], key: 'R' },
    { modifiers: [ModifierKey.Ctrl], key: 'L' },
    { modifiers: [ModifierKey.Ctrl, ModifierKey.Shift], key: 'I' },
    { modifiers: [ModifierKey.Meta], key: 'R' },
];

// Special key used to apply background color to the hovered element.
export const APPLY_COLOR_MODIFIER = ModifierKey.Shift;
