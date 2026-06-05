// Content script: orchestrates every Pixly tool inside the inspected page.
// Listens to messages from the popup and the service worker, mounts the
// Shadow DOM, manages the user settings cache and dispatches keyboard events.

import { StorageKey } from '@/shared/constants/storage';
import { ToolId, type ToolIdValue } from '@/shared/constants/tools';
import { MessageType, type PixlyMessage } from '@/shared/types/messages';
import { registerMessageListener } from '@/shared/messaging';
import { loadSettings } from '@/shared/utils/storage';
import { loadActiveToolsForOrigin, saveActiveToolsForOrigin, isSessionRestorableTool } from '@/shared/utils/active-tools';
import { matchesEvent } from '@/shared/utils/shortcuts';
import type { UserSettings } from '@/shared/types/settings';
import { createToolRegistry, type RegistryEntry } from './tool-registry';
import { ColorApplierTool } from './tools/color-applier-tool';
import { ImageOverlayTool } from './overlay/image-overlay-tool';
import { SnapshotTool } from './overlay/snapshot-tool';
import { ensureShadowMount, removeShadowMount } from './shadow-host';
import { showNotification } from './notifications';
import type { Tool, ToolContext } from './tools/tool';
import { clearAllAppliedStyles } from './tools/applied-styles';

const ESCAPE_KEY = 'Escape';
const DISTANCE_LINE_CSS_VAR = '--pixly-distance-line';

// Name used for the long-lived port to the service worker. When the extension
// is reloaded (hot-reload or manual), Chrome disconnects the port before the
// new content script is injected, giving the old instance a reliable signal to
// tear itself down.
const RUNTIME_PORT_NAME = 'pixly-content-script';

// How often (ms) we poll chrome.runtime.id as a secondary defence against
// extension context invalidation when the port alone is not enough (e.g. the
// MV3 service worker restarts without triggering onDisconnect on the port).
const CONTEXT_POLL_INTERVAL_MS = 2_000;

class PixlyController {
    private settings: UserSettings | null = null;
    private readonly registry: RegistryEntry[] = createToolRegistry();
    private readonly activeTools = new Set<ToolIdValue>();
    private readonly settingsListeners = new Set<(settings: UserSettings) => void>();
    private readonly colorApplier = new ColorApplierTool();
    private colorApplierActive = false;
    private isShutdown = false;
    private contextPollTimer: ReturnType<typeof setInterval> | null = null;
    private readonly handleKeyDown = this.onKeyDown.bind(this);

    async init(): Promise<void> {
        this.connectRuntimePort();
        this.settings = await loadSettings();
        this.applyDistanceLineColor(this.settings.distanceLine.color);
        this.registerListeners();
        this.bindKeyboardShortcuts();
        await this.restoreOverlayIfPersisted();
        await this.restoreActiveToolsIfPersisted();
    }

    // Open a long-lived port to the service worker. When the extension is
    // reloaded, Chrome disconnects the port before injecting the new content
    // script. The disconnect fires on the old instance, which then tears itself
    // down so that the new instance starts with a clean DOM.
    //
    // A secondary interval poll is started as a fallback for cases where the
    // MV3 service worker restarts silently without triggering onDisconnect.
    // In MV3, the service worker is terminated after ~30s of inactivity and the
    // long-lived port disconnects each time that happens — even though the
    // extension context (chrome.runtime.id) remains valid. We must NOT call
    // shutdown() on every port disconnect; we only shut down when the extension
    // context itself is invalidated (extension reload / update / disable).
    //
    // The context-polling interval is the authoritative signal. The port is
    // optional: if its disconnect fires while runtime.id is already gone, we
    // can shutdown a tick earlier than the poll, but we never shutdown while
    // runtime.id is still valid.
    private connectRuntimePort(): void {
        try {
            const port = chrome.runtime.connect({ name: RUNTIME_PORT_NAME });

            port.onDisconnect.addListener(() => {
                if (!chrome.runtime?.id) {
                    this.shutdown();
                }
                // Otherwise: the MV3 service worker idle-terminated. The
                // extension is still alive. Do nothing.
            });
        } catch {
            // connect() throws only if the context is already invalidated.
            // The polling timer below will pick that up.
        }

        this.contextPollTimer = setInterval(() => {
            if (!chrome.runtime?.id) {
                this.shutdown();
            }
        }, CONTEXT_POLL_INTERVAL_MS);
    }

    // Fully tears down this content script instance: disables all tools,
    // removes every DOM element it owns, and detaches global listeners.
    // After this returns, any lingering async callbacks are guarded by
    // `isShutdown` and become no-ops.
    shutdown(): void {
        if (this.isShutdown) {
            return;
        }

        this.isShutdown = true;

        if (this.contextPollTimer !== null) {
            clearInterval(this.contextPollTimer);
            this.contextPollTimer = null;
        }

        this.disableAll();
        removeShadowMount();
        document.removeEventListener('keydown', this.handleKeyDown, true);
    }

    // If the user had an overlay loaded before a reload / tab switch, reactivate
    // the ImageOverlay tool so its enable() can rehydrate position, size and
    // lock state from chrome.storage.local.
    private async restoreOverlayIfPersisted(): Promise<void> {
        try {
            const stored = await chrome.storage.local.get(StorageKey.OverlayState);

            // Re-check after the async gap: shutdown() may have been called
            // while the storage read was in flight.
            if (this.isShutdown) {
                return;
            }

            if (stored[StorageKey.OverlayState]) {
                this.ensureToolActive(ToolId.ImageOverlay);
            }
        } catch (error) {
            console.warn('[Pixly] could not check persisted overlay state:', error);
        }
    }

    // Re-activate the ambient tools the user had enabled for this origin before
    // a reload. The set is session-scoped (cleared when the browser closes) and
    // already filtered to restorable tools by loadActiveToolsForOrigin.
    private async restoreActiveToolsIfPersisted(): Promise<void> {
        try {
            const toolIds = await loadActiveToolsForOrigin(window.location.origin);

            // Re-check after the async gap: shutdown() may have run meanwhile.
            if (this.isShutdown) {
                return;
            }

            for (const toolId of toolIds) {
                this.ensureToolActive(toolId);
            }
        } catch (error) {
            console.warn('[Pixly] could not restore active tools:', error);
        }
    }

    private registerListeners(): void {
        registerMessageListener(async (message: PixlyMessage) => {
            if (this.isShutdown) {
                return undefined;
            }

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
                    this.persistActiveTools();
                    break;
                case MessageType.UpdateSettings:
                    this.settings = message.payload.settings;
                    this.applyDistanceLineColor(this.settings.distanceLine.color);
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
                case MessageType.GetOverlayState: {
                    const overlay = this.getImageOverlay();
                    const snapshot = overlay?.getSnapshotState() ?? { loaded: false, locked: false, scalePercent: 0 };

                    return {
                        type: MessageType.GetOverlayStateResponse,
                        payload: snapshot,
                    };
                }
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

        this.persistActiveTools();
    }

    // Persist the per-origin set of active ambient tools so a reload can restore
    // them. Non-restorable tools are filtered out by saveActiveToolsForOrigin.
    // Deliberately NOT called from shutdown(): that teardown runs on extension
    // reload/update, and wiping the memory there would defeat the feature.
    private persistActiveTools(): void {
        if (this.isShutdown) {
            return;
        }

        const restorable = Array.from(this.activeTools).filter(isSessionRestorableTool);
        void saveActiveToolsForOrigin(window.location.origin, restorable);
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

    // Pushes the user-chosen color into the Shadow DOM as a CSS custom property
    // so every dashed distance line (inspector + distance meter) and the live
    // distance label re-paint instantly without needing to touch each tool.
    private applyDistanceLineColor(color: string): void {
        const { host } = ensureShadowMount();
        host.style.setProperty(DISTANCE_LINE_CSS_VAR, color);
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (this.isShutdown || !this.settings) {
            return;
        }

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
    }

    private bindKeyboardShortcuts(): void {
        document.addEventListener('keydown', this.handleKeyDown, true);
    }

    private handleEscape(): void {
        for (const entry of this.registry) {
            if (this.activeTools.has(entry.id)) {
                entry.tool.onEscape?.();
            }
        }

        this.disableAll();
        this.persistActiveTools();
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
