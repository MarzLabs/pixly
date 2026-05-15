// Popup controller: renders the tool list, persists user settings and
// dispatches messages to the active tab's content script.

import {
    BLEND_MODES,
    DISTANCE_LINE_DEFAULTS,
    INSPECTOR_PANEL_DEFAULTS,
    MULTI_SELECTION_DEFAULTS,
    PALETTE_MAX_COLORS,
    SNAP_DEFAULTS,
    STAGE_1_TOOLS,
    STAGE_2_TOOLS,
    TOOL_LABELS,
    type ToolIdValue,
} from '@/shared/constants';
import { MessageType, type PixlyMessage } from '@/shared/types/messages';
import type { UserSettings } from '@/shared/types/settings';
import { sendMessageToRuntime, sendMessageToTab } from '@/shared/messaging';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '@/shared/utils/storage';
import { isValidHexColor, expandShortHex } from '@/shared/utils/colors';
import { validateImageFile } from '@/shared/utils/image-validation';
import { findShortcutConflict, normalizeShortcut, shortcutToString } from '@/shared/utils/shortcuts';
import type { KeyboardShortcut } from '@/shared/constants/shortcuts';
import { ModifierKey } from '@/shared/constants/shortcuts';

const OPACITY_PERCENT_DIVISOR = 100;
const NOTIFICATION_RESET_MS = 3000;

class PopupController {
    private settings: UserSettings = DEFAULT_SETTINGS;
    private activeTools = new Set<ToolIdValue>();
    private overlayLoaded = false;
    private lastOverlayDataUrl: string | null = null;

    async init(): Promise<void> {
        this.settings = await loadSettings();
        await this.fetchActiveTools();
        this.bindTabs();
        this.renderStageTools();
        this.renderPalette();
        this.renderPaletteEditor();
        this.renderShortcuts();
        this.bindGridControls();
        this.bindOverlayControls();
        this.bindClearAll();
        this.bindNewColor();
        this.bindMeasurementUnit();
        this.bindResetSettings();
        this.bindPreferences();
        this.bindDistanceLineColor();
        this.renderWelcomeBanner();
    }

    private bindTabs(): void {
        const tabs = document.querySelectorAll<HTMLButtonElement>('.tab');
        const panels = document.querySelectorAll<HTMLDivElement>('.tab-panel');

        for (const tab of tabs) {
            tab.addEventListener('click', () => {
                tabs.forEach((t) => t.classList.remove('active'));
                panels.forEach((p) => p.classList.remove('active'));
                tab.classList.add('active');
                document.getElementById(`tab-${tab.dataset.tab}`)?.classList.add('active');
            });
        }
    }

    private async fetchActiveTools(): Promise<void> {
        try {
            const tabId = await this.getActiveTabId();

            if (!tabId) {
                return;
            }

            const response = await sendMessageToTab(tabId, {
                type: MessageType.GetActiveTools,
                payload: undefined,
            }) as { payload?: { activeTools: ToolIdValue[] } } | undefined;

            if (response?.payload?.activeTools) {
                this.activeTools = new Set(response.payload.activeTools);
            }
        } catch {
            // Content script may not be available on chrome:// pages or new tabs.
        }
    }

    private renderStageTools(): void {
        this.renderToolList('stage-1-tools', STAGE_1_TOOLS);
        this.renderToolList('stage-2-tools', STAGE_2_TOOLS);
    }

    private renderToolList(containerId: string, tools: ToolIdValue[]): void {
        const container = document.getElementById(containerId);

        if (!container) return;

        container.innerHTML = '';

        for (const toolId of tools) {
            const li = document.createElement('li');
            li.className = this.activeTools.has(toolId) ? 'active' : '';
            li.innerHTML = `
                <label>${TOOL_LABELS[toolId]}</label>
                <div class="toggle ${this.activeTools.has(toolId) ? 'on' : ''}" role="switch"></div>
            `;

            const toggle = li.querySelector<HTMLDivElement>('.toggle')!;
            toggle.addEventListener('click', async () => {
                const enabled = !toggle.classList.contains('on');
                toggle.classList.toggle('on', enabled);
                li.classList.toggle('active', enabled);

                if (enabled) {
                    this.activeTools.add(toolId);
                } else {
                    this.activeTools.delete(toolId);
                }

                await this.dispatchToggle(toolId, enabled);
            });

            container.appendChild(li);
        }
    }

    private async dispatchToggle(toolId: ToolIdValue, enabled: boolean): Promise<void> {
        const tabId = await this.getActiveTabId();
        if (!tabId) return;

        await sendMessageToTab(tabId, {
            type: MessageType.ToggleTool,
            payload: { toolId, enabled },
        });
    }

    private renderPalette(): void {
        const strip = document.getElementById('palette-strip');
        if (!strip) return;

        strip.innerHTML = '';

        for (const color of this.settings.palette) {
            const swatch = document.createElement('div');
            swatch.className = 'palette-swatch';
            swatch.style.background = color;
            swatch.title = color;

            if (this.settings.selectedPaletteColor === color) {
                swatch.classList.add('selected');
            }

            swatch.addEventListener('click', async () => {
                this.settings.selectedPaletteColor = color;
                await this.persist();
                this.renderPalette();
            });

            strip.appendChild(swatch);
        }
    }

    private renderPaletteEditor(): void {
        const editor = document.getElementById('palette-editor-list');
        if (!editor) return;

        editor.innerHTML = '';

        this.settings.palette.forEach((color, index) => {
            const swatch = document.createElement('div');
            swatch.className = 'palette-swatch';
            swatch.style.background = color;
            swatch.title = color;

            const remove = document.createElement('button');
            remove.type = 'button';
            remove.textContent = '×';
            remove.title = 'Remove color';
            remove.addEventListener('click', async () => {
                this.settings.palette.splice(index, 1);

                if (this.settings.selectedPaletteColor === color) {
                    this.settings.selectedPaletteColor = null;
                }

                await this.persist();
                this.renderPalette();
                this.renderPaletteEditor();
            });

            swatch.appendChild(remove);
            editor.appendChild(swatch);
        });
    }

    private bindNewColor(): void {
        const button = document.getElementById('add-color');
        const hexInput = document.getElementById('new-color-hex') as HTMLInputElement | null;
        const picker = document.getElementById('new-color-picker') as HTMLInputElement | null;
        const error = document.getElementById('palette-error');

        if (!button || !hexInput || !picker || !error) return;

        picker.addEventListener('input', () => {
            hexInput.value = picker.value.toUpperCase();
        });

        button.addEventListener('click', async () => {
            const value = hexInput.value.trim() || picker.value;

            if (!isValidHexColor(value)) {
                error.textContent = 'The value entered is not a valid color. Use a hex value (e.g., #FF5733) or the color picker.';

                return;
            }

            if (this.settings.palette.length >= PALETTE_MAX_COLORS) {
                error.textContent = `The palette accepts up to ${PALETTE_MAX_COLORS} colors. Remove one before adding another.`;

                return;
            }

            const expanded = expandShortHex(value).toUpperCase();

            if (this.settings.palette.includes(expanded)) {
                error.textContent = 'That color is already in the palette.';

                return;
            }

            this.settings.palette.push(expanded);
            await this.persist();
            this.renderPalette();
            this.renderPaletteEditor();
            error.textContent = '';
            hexInput.value = '';
        });
    }

    private renderShortcuts(): void {
        const list = document.getElementById('shortcut-list');
        if (!list) return;

        list.innerHTML = '';

        for (const toolId of [...STAGE_1_TOOLS, ...STAGE_2_TOOLS]) {
            const shortcut = this.settings.shortcuts[toolId];
            const li = document.createElement('li');
            const input = document.createElement('input');
            input.type = 'text';
            input.value = shortcut ? shortcutToString(shortcut) : '';
            input.placeholder = 'Unassigned';
            input.readOnly = true;

            input.addEventListener('keydown', async (event) => {
                event.preventDefault();

                if (event.key === 'Escape') {
                    this.settings.shortcuts[toolId] = null;
                    input.value = '';
                    input.classList.remove('invalid');
                    await this.persist();

                    return;
                }

                if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) {
                    return;
                }

                const modifiers: KeyboardShortcut['modifiers'] = [];
                if (event.ctrlKey) modifiers.push(ModifierKey.Ctrl);
                if (event.shiftKey) modifiers.push(ModifierKey.Shift);
                if (event.altKey) modifiers.push(ModifierKey.Alt);
                if (event.metaKey) modifiers.push(ModifierKey.Meta);

                if (modifiers.length === 0) {
                    return;
                }

                const candidate = normalizeShortcut({
                    modifiers,
                    key: event.key.length === 1 ? event.key.toUpperCase() : event.key,
                });

                const conflict = findShortcutConflict(candidate, this.settings.shortcuts, toolId);

                if (conflict) {
                    input.classList.add('invalid');
                    input.title = 'The selected shortcut conflicts with an existing one. Please choose a different combination.';

                    return;
                }

                this.settings.shortcuts[toolId] = candidate;
                input.value = shortcutToString(candidate);
                input.classList.remove('invalid');
                input.title = '';
                await this.persist();
            });

            li.innerHTML = `<span>${TOOL_LABELS[toolId]}</span>`;
            li.appendChild(input);
            list.appendChild(li);
        }
    }

    private bindGridControls(): void {
        const columns = document.getElementById('grid-columns') as HTMLInputElement | null;
        const gutter = document.getElementById('grid-gutter') as HTMLInputElement | null;
        const maxWidth = document.getElementById('grid-max-width') as HTMLInputElement | null;
        const opacity = document.getElementById('grid-opacity') as HTMLInputElement | null;
        const color = document.getElementById('grid-color') as HTMLInputElement | null;

        if (!columns || !gutter || !maxWidth || !opacity || !color) return;

        columns.value = String(this.settings.grid.columns);
        gutter.value = String(this.settings.grid.gutterPx);
        maxWidth.value = String(this.settings.grid.maxWidthPx);
        opacity.value = String(this.settings.grid.opacity);
        color.value = this.settings.grid.color;

        const persist = async () => {
            this.settings.grid = {
                columns: parseInt(columns.value, 10),
                gutterPx: parseInt(gutter.value, 10),
                maxWidthPx: parseInt(maxWidth.value, 10),
                opacity: parseFloat(opacity.value),
                color: color.value,
            };

            await this.persist();
        };

        [columns, gutter, maxWidth, opacity, color].forEach((input) => {
            input.addEventListener('change', persist);
        });
    }

    private bindMeasurementUnit(): void {
        const select = document.getElementById('measurement-unit') as HTMLSelectElement | null;
        if (!select) return;

        select.value = this.settings.measurementUnit;
        select.addEventListener('change', async () => {
            this.settings.measurementUnit = select.value as UserSettings['measurementUnit'];
            await this.persist();
        });
    }

    private bindOverlayControls(): void {
        const fileInput = document.getElementById('overlay-file') as HTMLInputElement | null;
        const opacityInput = document.getElementById('overlay-opacity') as HTMLInputElement | null;
        const opacityValue = document.getElementById('overlay-opacity-value');
        const blendSelect = document.getElementById('overlay-blend') as HTMLSelectElement | null;
        const toggleButton = document.getElementById('overlay-toggle');
        const removeButton = document.getElementById('overlay-remove');
        const snapshotButton = document.getElementById('overlay-snapshot');
        const status = document.getElementById('overlay-status');

        if (!fileInput || !opacityInput || !opacityValue || !blendSelect || !toggleButton || !removeButton || !snapshotButton || !status) {
            return;
        }

        const initialPercent = Math.round(this.settings.overlay.opacity * OPACITY_PERCENT_DIVISOR);
        opacityInput.value = String(initialPercent);
        opacityValue.textContent = `${initialPercent}%`;

        if (BLEND_MODES.includes(this.settings.overlay.blendMode)) {
            blendSelect.value = this.settings.overlay.blendMode;
        }

        fileInput.addEventListener('change', async () => {
            const file = fileInput.files?.[0];

            if (!file) {
                return;
            }

            const validation = validateImageFile(file);

            if (!validation.ok) {
                this.flashStatus(status, validation.message ?? 'Invalid file.', true);

                return;
            }

            const dataUrl = await this.readFileAsDataUrl(file);
            const dimensions = await this.readImageDimensions(dataUrl);
            this.lastOverlayDataUrl = dataUrl;

            const tabId = await this.getActiveTabId();
            if (!tabId) return;

            await sendMessageToTab(tabId, {
                type: MessageType.LoadOverlayImage,
                payload: { dataUrl, fileName: file.name, width: dimensions.width, height: dimensions.height },
            });

            this.overlayLoaded = true;
            this.flashStatus(status, 'Image loaded into overlay.', false);
        });

        opacityInput.addEventListener('input', async () => {
            const percent = parseInt(opacityInput.value, 10);
            const opacity = percent / OPACITY_PERCENT_DIVISOR;
            opacityValue.textContent = `${percent}%`;
            this.settings.overlay.opacity = opacity;
            await this.persist();
            await this.sendOverlayState({ opacity });
        });

        blendSelect.addEventListener('change', async () => {
            const blendMode = blendSelect.value;
            this.settings.overlay.blendMode = blendMode;
            await this.persist();
            await this.sendOverlayState({ blendMode });
        });

        toggleButton.addEventListener('click', async () => {
            if (!this.overlayLoaded) return;

            const tabId = await this.getActiveTabId();
            if (!tabId) return;

            await sendMessageToTab(tabId, {
                type: MessageType.UpdateOverlayState,
                payload: { visible: false },
            });

            // Re-show on next click via toggleVisibility on the tool.
            setTimeout(async () => {
                await sendMessageToTab(tabId, {
                    type: MessageType.UpdateOverlayState,
                    payload: { visible: true },
                });
            }, 0);
        });

        removeButton.addEventListener('click', async () => {
            const tabId = await this.getActiveTabId();
            if (!tabId) return;

            await sendMessageToTab(tabId, {
                type: MessageType.RemoveOverlayImage,
                payload: undefined,
            });

            this.overlayLoaded = false;
            this.lastOverlayDataUrl = null;
            this.flashStatus(status, 'Overlay removed.', false);
        });

        snapshotButton.addEventListener('click', async () => {
            if (!this.lastOverlayDataUrl) {
                this.flashStatus(status, 'Load a reference image first.', true);

                return;
            }

            const response = await sendMessageToRuntime(({
                type: MessageType.TakeSnapshot,
                payload: undefined,
            })) as PixlyMessage | undefined;

            if (response?.type !== MessageType.TakeSnapshotResponse || !response.payload.dataUrl) {
                this.flashStatus(status, response?.type === MessageType.TakeSnapshotResponse ? response.payload.error ?? 'Unable to capture the screen.' : 'Unable to capture the screen.', true);

                return;
            }

            const tabId = await this.getActiveTabId();
            if (!tabId) return;

            await sendMessageToTab(tabId, {
                type: MessageType.ShowSideBySide,
                payload: {
                    snapshotDataUrl: response.payload.dataUrl,
                    overlayDataUrl: this.lastOverlayDataUrl,
                },
            });

            this.flashStatus(status, 'Snapshot ready.', false);
        });
    }

    private async sendOverlayState(patch: Record<string, unknown>): Promise<void> {
        const tabId = await this.getActiveTabId();
        if (!tabId) return;

        await sendMessageToTab(tabId, {
            type: MessageType.UpdateOverlayState,
            payload: patch,
        });
    }

    private bindClearAll(): void {
        const button = document.getElementById('clear-all');
        if (!button) return;

        button.addEventListener('click', async () => {
            const tabId = await this.getActiveTabId();

            if (!tabId) return;

            await sendMessageToTab(tabId, {
                type: MessageType.ClearAppliedStyles,
                payload: undefined,
            });

            await sendMessageToTab(tabId, {
                type: MessageType.DisableAllTools,
                payload: undefined,
            });

            this.activeTools.clear();
            this.renderStageTools();
        });
    }

    private bindResetSettings(): void {
        const button = document.getElementById('reset-settings');
        if (!button) return;

        button.addEventListener('click', async () => {
            this.settings = {
                ...DEFAULT_SETTINGS,
                palette: [...DEFAULT_SETTINGS.palette],
                distanceLine: { ...DEFAULT_SETTINGS.distanceLine },
            };
            await this.persist();
            this.renderPalette();
            this.renderPaletteEditor();
            this.renderShortcuts();
            this.bindGridControls();
            const select = document.getElementById('measurement-unit') as HTMLSelectElement | null;

            if (select) {
                select.value = this.settings.measurementUnit;
            }

            const picker = document.getElementById('distance-line-color') as HTMLInputElement | null;
            const hexInput = document.getElementById('distance-line-color-hex') as HTMLInputElement | null;

            if (picker && hexInput) {
                picker.value = this.settings.distanceLine.color;
                hexInput.value = this.settings.distanceLine.color.toUpperCase();
                hexInput.classList.remove('invalid');
            }
        });
    }

    private async readFileAsDataUrl(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsDataURL(file);
        });
    }

    private async readImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
        return new Promise((resolve) => {
            const image = new Image();
            image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
            image.onerror = () => resolve({ width: 0, height: 0 });
            image.src = dataUrl;
        });
    }

    private async persist(): Promise<void> {
        await saveSettings(this.settings);

        const tabId = await this.getActiveTabId();

        if (!tabId) {
            return;
        }

        await sendMessageToTab(tabId, {
            type: MessageType.UpdateSettings,
            payload: { settings: this.settings },
        });
    }

    private async getActiveTabId(): Promise<number | null> {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        return tab?.id ?? null;
    }

    private flashStatus(node: HTMLElement, message: string, isError: boolean): void {
        node.textContent = message;
        node.classList.toggle('error', isError);

        setTimeout(() => {
            if (node.textContent === message) {
                node.textContent = '';
                node.classList.remove('error');
            }
        }, NOTIFICATION_RESET_MS);
    }

    private bindPreferences(): void {
        const snapEnabled = document.getElementById('snap-enabled') as HTMLInputElement | null;
        const snapThreshold = document.getElementById('snap-threshold') as HTMLInputElement | null;
        const inspectorSide = document.getElementById('inspector-side') as HTMLSelectElement | null;
        const inspectorHideTooltip = document.getElementById('inspector-hide-tooltip') as HTMLInputElement | null;
        const multiSelectionMax = document.getElementById('multi-selection-max') as HTMLInputElement | null;

        if (!snapEnabled || !snapThreshold || !inspectorSide || !inspectorHideTooltip || !multiSelectionMax) {
            return;
        }

        snapEnabled.checked = this.settings.snap.enabled;
        snapThreshold.value = String(this.settings.snap.thresholdPx);
        snapThreshold.min = String(SNAP_DEFAULTS.minThresholdPx);
        snapThreshold.max = String(SNAP_DEFAULTS.maxThresholdPx);
        inspectorSide.value = this.settings.inspectorPanel.side;
        inspectorHideTooltip.checked = this.settings.inspectorPanel.hideFloatingTooltip;
        multiSelectionMax.value = String(this.settings.multiSelection.maxItems);
        multiSelectionMax.min = String(MULTI_SELECTION_DEFAULTS.minItems);
        multiSelectionMax.max = String(MULTI_SELECTION_DEFAULTS.maxAllowedItems);

        snapEnabled.addEventListener('change', async () => {
            this.settings.snap.enabled = snapEnabled.checked;
            await this.persist();
        });

        snapThreshold.addEventListener('change', async () => {
            const value = parseInt(snapThreshold.value, 10);

            if (Number.isNaN(value)) {
                snapThreshold.value = String(SNAP_DEFAULTS.thresholdPx);

                return;
            }

            const clamped = Math.max(SNAP_DEFAULTS.minThresholdPx, Math.min(SNAP_DEFAULTS.maxThresholdPx, value));
            snapThreshold.value = String(clamped);
            this.settings.snap.thresholdPx = clamped;
            await this.persist();
        });

        inspectorSide.addEventListener('change', async () => {
            this.settings.inspectorPanel.side = inspectorSide.value as 'left' | 'right';
            await this.persist();
        });

        inspectorHideTooltip.addEventListener('change', async () => {
            this.settings.inspectorPanel.hideFloatingTooltip = inspectorHideTooltip.checked;
            await this.persist();
        });

        multiSelectionMax.addEventListener('change', async () => {
            const value = parseInt(multiSelectionMax.value, 10);

            if (Number.isNaN(value)) {
                multiSelectionMax.value = String(MULTI_SELECTION_DEFAULTS.maxItems);

                return;
            }

            this.settings.multiSelection.maxItems = Math.max(
                MULTI_SELECTION_DEFAULTS.minItems,
                Math.min(MULTI_SELECTION_DEFAULTS.maxAllowedItems, value),
            );
            multiSelectionMax.value = String(this.settings.multiSelection.maxItems);
            await this.persist();
        });

        // Reference the default constant to keep the import meaningful even if
        // the user resets through the global reset button.
        void INSPECTOR_PANEL_DEFAULTS;
    }

    private bindDistanceLineColor(): void {
        const picker = document.getElementById('distance-line-color') as HTMLInputElement | null;
        const hexInput = document.getElementById('distance-line-color-hex') as HTMLInputElement | null;
        const resetButton = document.getElementById('distance-line-color-reset') as HTMLButtonElement | null;

        if (!picker || !hexInput || !resetButton) {
            return;
        }

        const syncInputs = (color: string): void => {
            picker.value = color;
            hexInput.value = color.toUpperCase();
            hexInput.classList.remove('invalid');
        };

        const applyColor = async (color: string): Promise<void> => {
            this.settings.distanceLine.color = color;
            await this.persist();
        };

        syncInputs(this.settings.distanceLine.color);

        picker.addEventListener('input', async () => {
            const color = picker.value;
            syncInputs(color);
            await applyColor(color);
        });

        hexInput.addEventListener('change', async () => {
            const raw = hexInput.value.trim();

            if (!isValidHexColor(raw)) {
                hexInput.classList.add('invalid');

                return;
            }

            const expanded = expandShortHex(raw).toUpperCase();
            syncInputs(expanded);
            await applyColor(expanded);
        });

        resetButton.addEventListener('click', async () => {
            const defaultColor = DISTANCE_LINE_DEFAULTS.color;
            syncInputs(defaultColor);
            await applyColor(defaultColor);
        });
    }

    private renderWelcomeBanner(): void {
        const banner = document.getElementById('welcome-banner');
        const dismissButton = document.getElementById('welcome-dismiss');

        if (!banner || !dismissButton || !this.settings.showWelcomeMessage) {
            return;
        }

        banner.hidden = false;

        dismissButton.addEventListener('click', async () => {
            this.settings.showWelcomeMessage = false;
            banner.hidden = true;
            await this.persist();
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const controller = new PopupController();
    controller.init().catch((error) => {
        console.error('[Pixly popup] init error:', error);
    });
});
