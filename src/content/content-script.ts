// Content script: orchestrates every Pixly tool inside the inspected page.
// Listens to messages from the popup and the service worker, mounts the
// Shadow DOM, manages the user settings cache and dispatches keyboard events.

import { ToolId, type ToolIdValue } from '@/shared/constants/tools';
import { MessageType, type PixlyMessage } from '@/shared/types/messages';
import { registerMessageListener } from '@/shared/messaging';
import { loadSettings } from '@/shared/utils/storage';
import { matchesEvent } from '@/shared/utils/shortcuts';
import type { UserSettings } from '@/shared/types/settings';
import { createToolRegistry, type RegistryEntry } from './tool-registry';
import { ColorApplierTool } from './tools/color-applier-tool';
import { ImageOverlayTool } from './overlay/image-overlay-tool';
import { SnapshotTool } from './overlay/snapshot-tool';
import { ensureShadowMount } from './shadow-host';
import { showNotification } from './notifications';
import type { Tool, ToolContext } from './tools/tool';
import { clearAllAppliedStyles } from './tools/applied-styles';

const ESCAPE_KEY = 'Escape';

class PixlyController {
    private settings: UserSettings | null = null;
    private readonly registry: RegistryEntry[] = createToolRegistry();
    private readonly activeTools = new Set<ToolIdValue>();
    private readonly settingsListeners = new Set<(settings: UserSettings) => void>();
    private readonly colorApplier = new ColorApplierTool();
    private colorApplierActive = false;

    async init(): Promise<void> {
        this.settings = await loadSettings();
        this.registerListeners();
        this.bindKeyboardShortcuts();
    }

    private registerListeners(): void {
        registerMessageListener(async (message: PixlyMessage) => {
            if (!this.settings) {
                this.settings = await loadSettings();
            }

            switch (message.type) {
                case MessageType.ToggleTool:
                    this.toggleTool(message.payload.toolId, message.payload.enabled);
                    break;
                case MessageType.GetActiveTools:
                    return {
                        type: MessageType.GetActiveToolsResponse,
                        payload: { activeTools: Array.from(this.activeTools) },
                    };
                case MessageType.DisableAllTools:
                    this.disableAll();
                    break;
                case MessageType.UpdateSettings:
                    this.settings = message.payload.settings;
                    this.notifySettingsChange();
                    break;
                case MessageType.ClearAppliedStyles:
                    clearAllAppliedStyles();
                    showNotification('Estilos aplicados limpiados.');
                    break;
                case MessageType.LoadOverlayImage:
                    this.ensureToolActive(ToolId.ImageOverlay);
                    this.getImageOverlay()?.loadImage(message.payload.dataUrl, message.payload.width, message.payload.height);
                    break;
                case MessageType.RemoveOverlayImage:
                    this.getImageOverlay()?.removeImage();
                    break;
                case MessageType.UpdateOverlayState:
                    this.getImageOverlay()?.updateState(message.payload);
                    break;
                case MessageType.ShowSideBySide:
                    this.ensureToolActive(ToolId.Snapshot);
                    this.getSnapshot()?.showSideBySide(message.payload.snapshotDataUrl, message.payload.overlayDataUrl);
                    break;
                case MessageType.CommandTriggered:
                    this.handleCommand(message.payload.command);
                    break;
                default:
                    break;
            }

            return undefined;
        });
    }

    private toggleTool(toolId: ToolIdValue, enabled: boolean): void {
        if (enabled) {
            this.ensureToolActive(toolId);
        } else {
            this.ensureToolInactive(toolId);
        }
    }

    private ensureToolActive(toolId: ToolIdValue): void {
        if (this.activeTools.has(toolId) || !this.settings) {
            return;
        }

        const entry = this.registry.find((e) => e.id === toolId);

        if (!entry) {
            return;
        }

        entry.tool.enable(this.createContext());
        this.activeTools.add(toolId);

        if (toolId === ToolId.Inspector && !this.colorApplierActive) {
            this.colorApplier.enable(this.createContext());
            this.colorApplierActive = true;
        }
    }

    private ensureToolInactive(toolId: ToolIdValue): void {
        if (!this.activeTools.has(toolId)) {
            return;
        }

        const entry = this.registry.find((e) => e.id === toolId);

        if (!entry) {
            return;
        }

        entry.tool.disable();
        this.activeTools.delete(toolId);

        if (toolId === ToolId.Inspector && this.colorApplierActive) {
            this.colorApplier.disable();
            this.colorApplierActive = false;
        }
    }

    private disableAll(): void {
        for (const toolId of Array.from(this.activeTools)) {
            this.ensureToolInactive(toolId);
        }
    }

    private createContext(): ToolContext {
        const controller = this;

        return {
            get settings() {
                return controller.settings ?? (() => { throw new Error('Settings not loaded.'); })();
            },
            showNotification,
            onSettingsChange(handler) {
                controller.settingsListeners.add(handler);

                return () => controller.settingsListeners.delete(handler);
            },
        };
    }

    private notifySettingsChange(): void {
        if (!this.settings) return;

        for (const listener of this.settingsListeners) {
            listener(this.settings);
        }
    }

    private bindKeyboardShortcuts(): void {
        document.addEventListener('keydown', (event) => {
            if (!this.settings) return;

            if (event.key === ESCAPE_KEY) {
                this.handleEscape();

                return;
            }

            for (const [toolId, shortcut] of Object.entries(this.settings.shortcuts)) {
                if (!shortcut) continue;

                if (matchesEvent(shortcut, event)) {
                    event.preventDefault();
                    this.toggleTool(toolId as ToolIdValue, !this.activeTools.has(toolId as ToolIdValue));

                    return;
                }
            }
        }, true);
    }

    private handleEscape(): void {
        for (const entry of this.registry) {
            if (this.activeTools.has(entry.id)) {
                entry.tool.onEscape?.();
            }
        }

        this.disableAll();
    }

    private handleCommand(command: string): void {
        switch (command) {
            case 'toggle-inspector':
                this.toggleTool(ToolId.Inspector, !this.activeTools.has(ToolId.Inspector));
                break;
            case 'toggle-overlay':
                this.getImageOverlay()?.toggleVisibility();
                break;
            case 'toggle-grid':
                this.toggleTool(ToolId.GridOverlay, !this.activeTools.has(ToolId.GridOverlay));
                break;
            case 'toggle-typography':
                this.toggleTool(ToolId.Typography, !this.activeTools.has(ToolId.Typography));
                break;
            default:
                break;
        }
    }

    private findTool<T extends Tool>(toolId: ToolIdValue): T | null {
        const entry = this.registry.find((e) => e.id === toolId);

        return (entry?.tool as T) ?? null;
    }

    private getImageOverlay(): ImageOverlayTool | null {
        return this.findTool<ImageOverlayTool>(ToolId.ImageOverlay);
    }

    private getSnapshot(): SnapshotTool | null {
        return this.findTool<SnapshotTool>(ToolId.Snapshot);
    }
}

// Single instance per content script execution.
const controller = new PixlyController();
controller.init().catch((error) => {
    console.error('[Pixly] failed to initialize:', error);
});

// Make sure the Shadow host exists from the start so other tools can mount.
ensureShadowMount();
