// Common interface every tool must implement so the content script can
// activate/deactivate them uniformly.

import type { UserSettings } from '@/shared/types/settings';

export interface ToolContext {
    settings: UserSettings;
    showNotification(message: string): void;
    onSettingsChange(handler: (settings: UserSettings) => void): () => void;
}

export interface Tool {
    enable(context: ToolContext): void;
    disable(): void;
    onSettingsChange?(settings: UserSettings): void;
    onEscape?(): void;
}
