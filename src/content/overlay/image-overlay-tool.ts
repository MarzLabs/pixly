// Image overlay: lets the user drop a Figma export on top of the page with
// adjustable opacity, blend mode, drag-to-align, corner-handle resize,
// keyboard nudge and a lock toggle. Persists position, size and lock state
// per overlay session so they survive tab switches and full page reloads.

import { OVERLAY_Z_INDEX } from '@/shared/constants/ui';
import { StorageKey } from '@/shared/constants/storage';
import { MessageType } from '@/shared/types/messages';
import { sendMessageToRuntime } from '@/shared/messaging';
import { ensureShadowMount } from '../shadow-host';
import type { Tool, ToolContext } from '../tools/tool';
import {
    clampToViewport,
    computeResize,
    nudgePosition,
    scalePercent,
    type Point,
    type Rect,
    type ResizeHandle,
} from './overlay-geometry';

const INITIAL_OPACITY = 0.5;
const INITIAL_BLEND_MODE = 'normal';
const INITIAL_POSITION_X = 0;
const INITIAL_POSITION_Y = 0;

// Alt+K lock toggle (acceptance criterion 14). Alt+L is already bound to
// Magnifier in DEFAULT_SHORTCUTS, so we use K instead.
const LOCK_SHORTCUT_KEY = 'k';

// Persistence-state save throttling — chrome.storage.local writes are async
// and the user can fire dozens of mousemove / arrow events per second.
const PERSIST_DEBOUNCE_MS = 120;

// How long the lock-attempt visual hint stays on screen (sad-path scenario 4).
const LOCK_HINT_FADE_MS = 900;

// Tags whose focus suppresses overlay-driven keyboard handling.
const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

// Class names used by the overlay DOM. Kept inside the file so a single search
// surfaces every CSS hook that this tool touches.
const CLASS_CONTAINER = 'pixly-image-overlay';
const CLASS_HANDLE = 'pixly-overlay-handle';
const CLASS_TOOLTIP = 'pixly-overlay-tooltip';
const CLASS_SELECTED = 'is-selected';
const CLASS_LOCKED = 'is-locked';
const CLASS_LOCK_HINT = 'pixly-overlay-lock-hint';

const HANDLES: readonly ResizeHandle[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];

interface OverlayState {
    dataUrl: string;
    naturalWidth: number;
    naturalHeight: number;
    width: number;
    height: number;
    positionX: number;
    positionY: number;
    opacity: number;
    blendMode: string;
    visible: boolean;
    locked: boolean;
}

interface PersistedOverlayState {
    dataUrl: string;
    naturalWidth: number;
    naturalHeight: number;
    width: number;
    height: number;
    positionX: number;
    positionY: number;
    locked: boolean;
}

interface DragState {
    pointerOffset: Point;
    startPosition: Point;
}

interface ResizeState {
    handle: ResizeHandle;
    startRect: Rect;
    pointerOffset: Point;
    preserveAspectRatio: boolean;
}

export class ImageOverlayTool implements Tool {
    private context: ToolContext | null = null;
    private container: HTMLDivElement | null = null;
    private img: HTMLImageElement | null = null;
    private tooltip: HTMLDivElement | null = null;
    private lockHint: HTMLDivElement | null = null;
    private state: OverlayState | null = null;
    private selected = false;
    private drag: DragState | null = null;
    private resize: ResizeState | null = null;
    private persistTimer: ReturnType<typeof setTimeout> | null = null;
    private lockHintTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly handleMouseMove = this.onMouseMove.bind(this);
    private readonly handleMouseUp = this.onMouseUp.bind(this);
    private readonly handleKeyDown = this.onKeyDown.bind(this);
    private readonly handleDocumentMouseDown = this.onDocumentMouseDown.bind(this);

    enable(context: ToolContext): void {
        this.context = context;
        ensureShadowMount();
        // Restore a previously persisted overlay (if any) so the user gets the
        // same image, position, size and lock state across reloads / tab swaps.
        void this.restorePersistedState();
    }

    disable(): void {
        this.removeImage();
        this.context = null;
    }

    loadImage(dataUrl: string, naturalWidth: number, naturalHeight: number): void {
        if (!this.context) {
            return;
        }

        this.removeImage();
        this.mountOverlay({
            dataUrl,
            naturalWidth,
            naturalHeight,
            width: naturalWidth,
            height: naturalHeight,
            positionX: INITIAL_POSITION_X,
            positionY: INITIAL_POSITION_Y,
            opacity: this.context.settings.overlay.opacity ?? INITIAL_OPACITY,
            blendMode: this.context.settings.overlay.blendMode ?? INITIAL_BLEND_MODE,
            visible: true,
            locked: false,
        });
        this.schedulePersist();
        this.broadcastStateChange();
    }

    updateState(
        patch: Partial<Pick<OverlayState,
            'opacity' | 'blendMode' | 'positionX' | 'positionY'
            | 'visible' | 'width' | 'height' | 'locked'>>,
    ): void {
        if (!this.state || !this.container) {
            return;
        }

        Object.assign(this.state, patch);
        this.applyStyles();

        if ('locked' in patch || 'width' in patch || 'height' in patch || 'visible' in patch) {
            this.updateHandlesVisibility();
        }

        if ('locked' in patch && patch.locked === true) {
            // Locking always clears selection (acceptance criterion 13).
            this.setSelected(false);
        }

        this.schedulePersist();
        this.broadcastStateChange();
    }

    removeImage(): void {
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
        document.removeEventListener('keydown', this.handleKeyDown, true);
        document.removeEventListener('mousedown', this.handleDocumentMouseDown, true);
        this.clearPersistTimer();
        this.clearLockHintTimer();
        this.container?.remove();
        this.tooltip?.remove();
        this.lockHint?.remove();
        this.container = null;
        this.img = null;
        this.tooltip = null;
        this.lockHint = null;
        this.state = null;
        this.drag = null;
        this.resize = null;
        this.selected = false;
        void this.clearPersistedState();
        this.broadcastStateChange();
    }

    toggleVisibility(): void {
        if (!this.state) {
            return;
        }

        this.updateState({ visible: !this.state.visible });
    }

    toggleLock(): void {
        if (!this.state) {
            return;
        }

        this.updateState({ locked: !this.state.locked });
        this.context?.showNotification(this.state.locked ? 'Overlay locked.' : 'Overlay unlocked.');
    }

    onEscape(): void {
        this.setSelected(false);
    }

    getSnapshotState(): { loaded: boolean; locked: boolean; scalePercent: number } {
        if (!this.state) {
            return { loaded: false, locked: false, scalePercent: 0 };
        }

        return {
            loaded: true,
            locked: this.state.locked,
            scalePercent: scalePercent(this.state.width, this.state.naturalWidth),
        };
    }

    private mountOverlay(initial: OverlayState): void {
        const { layer } = ensureShadowMount();
        layer.classList.add('interactive');

        this.state = { ...initial };
        this.container = this.buildContainer();
        layer.appendChild(this.container);

        this.applyStyles();
        this.updateHandlesVisibility();

        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);
        document.addEventListener('keydown', this.handleKeyDown, true);
        document.addEventListener('mousedown', this.handleDocumentMouseDown, true);
    }

    private buildContainer(): HTMLDivElement {
        const container = document.createElement('div');
        container.className = CLASS_CONTAINER;
        container.style.zIndex = String(OVERLAY_Z_INDEX);
        container.style.left = '0';
        container.style.top = '0';

        this.img = document.createElement('img');
        this.img.alt = 'Pixly overlay';
        container.appendChild(this.img);

        for (const handle of HANDLES) {
            const node = document.createElement('div');
            node.className = `${CLASS_HANDLE} ${CLASS_HANDLE}--${handle}`;
            node.dataset.handle = handle;
            node.addEventListener('mousedown', (event) => this.onHandleMouseDown(event, handle));
            container.appendChild(node);
        }

        container.addEventListener('mousedown', (event) => this.onContainerMouseDown(event));

        return container;
    }

    private applyStyles(): void {
        if (!this.state || !this.container || !this.img) {
            return;
        }

        const { state, container, img } = this;
        container.style.width = `${state.width}px`;
        container.style.height = `${state.height}px`;
        container.style.opacity = String(state.opacity);
        container.style.mixBlendMode = state.blendMode;
        container.style.transform = `translate(${state.positionX}px, ${state.positionY}px)`;
        container.style.display = state.visible ? 'block' : 'none';
        container.classList.toggle(CLASS_LOCKED, state.locked);
        container.classList.toggle(CLASS_SELECTED, this.selected && !state.locked);

        if (img.src !== state.dataUrl) {
            img.src = state.dataUrl;
        }
    }

    private updateHandlesVisibility(): void {
        if (!this.container || !this.state) {
            return;
        }

        const handles = this.container.querySelectorAll<HTMLDivElement>(`.${CLASS_HANDLE}`);
        const visible = !this.state.locked && this.state.visible;

        handles.forEach((node) => {
            node.style.display = visible ? '' : 'none';
        });
    }

    private onContainerMouseDown(event: MouseEvent): void {
        if (!this.state) {
            return;
        }

        // Resize handles bubble up to here but they already started their own
        // resize state — let them take precedence.
        if (this.resize) {
            return;
        }

        const target = event.target as HTMLElement;

        if (target.classList.contains(CLASS_HANDLE)) {
            return;
        }

        if (this.state.locked) {
            this.flashLockHint();
            event.preventDefault();
            event.stopPropagation();

            return;
        }

        // Begin drag and select.
        this.setSelected(true);
        this.drag = {
            pointerOffset: { x: event.clientX, y: event.clientY },
            startPosition: { x: this.state.positionX, y: this.state.positionY },
        };
        event.preventDefault();
        event.stopPropagation();
    }

    private onHandleMouseDown(event: MouseEvent, handle: ResizeHandle): void {
        if (!this.state || this.state.locked) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        this.resize = {
            handle,
            startRect: {
                x: this.state.positionX,
                y: this.state.positionY,
                width: this.state.width,
                height: this.state.height,
            },
            pointerOffset: { x: 0, y: 0 },
            preserveAspectRatio: !event.shiftKey,
        };
        this.setSelected(true);
        this.ensureTooltip();
    }

    private onMouseMove(event: MouseEvent): void {
        if (this.resize) {
            this.applyResize(event);

            return;
        }

        if (this.drag && this.state) {
            const deltaX = event.clientX - this.drag.pointerOffset.x;
            const deltaY = event.clientY - this.drag.pointerOffset.y;
            const proposed: Rect = {
                x: this.drag.startPosition.x + deltaX,
                y: this.drag.startPosition.y + deltaY,
                width: this.state.width,
                height: this.state.height,
            };
            const clamped = clampToViewport(proposed, this.viewportSize());
            this.state.positionX = clamped.x;
            this.state.positionY = clamped.y;
            this.applyStyles();
        }
    }

    private onMouseUp(): void {
        const hadInteraction = this.drag !== null || this.resize !== null;
        this.drag = null;
        this.resize = null;
        this.tooltip?.remove();
        this.tooltip = null;

        if (hadInteraction) {
            this.schedulePersist();
            this.broadcastStateChange();
        }
    }

    private applyResize(event: MouseEvent): void {
        if (!this.resize || !this.state) {
            return;
        }

        // Mid-drag Shift detection so the user can release/press while resizing
        // without committing the mouseup (acceptance criterion 3).
        this.resize.preserveAspectRatio = !event.shiftKey;

        const result = computeResize({
            handle: this.resize.handle,
            startRect: this.resize.startRect,
            pointer: { x: event.clientX, y: event.clientY },
            pointerOffset: this.resize.pointerOffset,
            naturalSize: { width: this.state.naturalWidth, height: this.state.naturalHeight },
            preserveAspectRatio: this.resize.preserveAspectRatio,
        });
        const clamped = clampToViewport(result.rect, this.viewportSize());
        this.state.positionX = clamped.x;
        this.state.positionY = clamped.y;
        this.state.width = result.rect.width;
        this.state.height = result.rect.height;
        this.applyStyles();
        this.renderResizeTooltip(result.snapped, result.capped, !this.resize.preserveAspectRatio);
    }

    private renderResizeTooltip(snapped: boolean, capped: 'min' | 'max' | null, freeAspect: boolean): void {
        if (!this.state) {
            return;
        }

        this.ensureTooltip();

        if (!this.tooltip) {
            return;
        }

        const widthRounded = Math.round(this.state.width);
        const heightRounded = Math.round(this.state.height);
        const percent = scalePercent(this.state.width, this.state.naturalWidth);
        const suffix = freeAspect
            ? 'free'
            : snapped
                ? `${percent}% • SNAP`
                : capped === 'max'
                    ? `${percent}% • MAX`
                    : capped === 'min'
                        ? `${percent}% • MIN`
                        : `${percent}%`;
        this.tooltip.textContent = `${widthRounded} × ${heightRounded} — ${suffix}`;
        this.tooltip.classList.toggle('is-snapped', snapped);

        const anchorOffset = 12;
        this.tooltip.style.left = `${this.state.positionX + this.state.width + anchorOffset}px`;
        this.tooltip.style.top = `${this.state.positionY + this.state.height + anchorOffset}px`;
    }

    private ensureTooltip(): void {
        if (this.tooltip) {
            return;
        }

        const { layer } = ensureShadowMount();
        this.tooltip = document.createElement('div');
        this.tooltip.className = CLASS_TOOLTIP;
        layer.appendChild(this.tooltip);
    }

    private flashLockHint(): void {
        if (!this.state) {
            return;
        }

        if (!this.lockHint) {
            const { layer } = ensureShadowMount();
            this.lockHint = document.createElement('div');
            this.lockHint.className = CLASS_LOCK_HINT;
            this.lockHint.textContent = 'Locked';
            layer.appendChild(this.lockHint);
        }

        this.lockHint.style.left = `${this.state.positionX + this.state.width / 2}px`;
        this.lockHint.style.top = `${this.state.positionY + this.state.height / 2}px`;
        this.lockHint.classList.remove('is-fading');
        // Force reflow so the next class re-triggers the CSS transition.
        void this.lockHint.offsetWidth;
        this.lockHint.classList.add('is-fading');

        this.clearLockHintTimer();
        this.lockHintTimer = setTimeout(() => {
            this.lockHint?.remove();
            this.lockHint = null;
        }, LOCK_HINT_FADE_MS);
    }

    private onDocumentMouseDown(event: MouseEvent): void {
        if (!this.state || !this.container) {
            return;
        }

        const target = event.target as Node | null;

        // Clicks inside the overlay shadow host or the overlay itself don't
        // deselect. Everything else does.
        const path = event.composedPath();

        if (path.includes(this.container)) {
            return;
        }

        if (this.selected) {
            this.setSelected(false);
        }

        // Silence the unused-variable warning for `target` (kept for future
        // diagnostics).
        void target;
    }

    private onKeyDown(event: KeyboardEvent): void {
        if (!this.state) {
            return;
        }

        if (this.isEditableTarget(event.target)) {
            return;
        }

        if (event.altKey && event.key.toLowerCase() === LOCK_SHORTCUT_KEY) {
            event.preventDefault();
            event.stopPropagation();
            this.toggleLock();

            return;
        }

        if (!this.selected || this.state.locked) {
            return;
        }

        const direction = this.directionFromKey(event.key);

        if (!direction) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        const next = nudgePosition(
            { x: this.state.positionX, y: this.state.positionY },
            direction,
            event.shiftKey,
        );
        const clamped = clampToViewport(
            { x: next.x, y: next.y, width: this.state.width, height: this.state.height },
            this.viewportSize(),
        );
        this.state.positionX = clamped.x;
        this.state.positionY = clamped.y;
        this.applyStyles();
        this.schedulePersist();
    }

    private directionFromKey(key: string): 'up' | 'down' | 'left' | 'right' | null {
        switch (key) {
            case 'ArrowUp': return 'up';
            case 'ArrowDown': return 'down';
            case 'ArrowLeft': return 'left';
            case 'ArrowRight': return 'right';
            default: return null;
        }
    }

    private isEditableTarget(target: EventTarget | null): boolean {
        if (!(target instanceof HTMLElement)) {
            return false;
        }

        if (target.isContentEditable) {
            return true;
        }

        return EDITABLE_TAGS.has(target.tagName);
    }

    private setSelected(value: boolean): void {
        if (this.selected === value) {
            return;
        }

        this.selected = value;
        this.applyStyles();
    }

    private viewportSize(): { width: number; height: number } {
        return { width: window.innerWidth, height: window.innerHeight };
    }

    private schedulePersist(): void {
        this.clearPersistTimer();
        this.persistTimer = setTimeout(() => {
            void this.persistState();
        }, PERSIST_DEBOUNCE_MS);
    }

    private clearPersistTimer(): void {
        if (this.persistTimer) {
            clearTimeout(this.persistTimer);
            this.persistTimer = null;
        }
    }

    private clearLockHintTimer(): void {
        if (this.lockHintTimer) {
            clearTimeout(this.lockHintTimer);
            this.lockHintTimer = null;
        }
    }

    private async persistState(): Promise<void> {
        if (!this.state) {
            return;
        }

        const snapshot: PersistedOverlayState = {
            dataUrl: this.state.dataUrl,
            naturalWidth: this.state.naturalWidth,
            naturalHeight: this.state.naturalHeight,
            width: this.state.width,
            height: this.state.height,
            positionX: this.state.positionX,
            positionY: this.state.positionY,
            locked: this.state.locked,
        };

        try {
            await chrome.storage.local.set({ [StorageKey.OverlayState]: snapshot });
        } catch (error) {
            console.warn('[Pixly] failed to persist overlay state:', error);
        }
    }

    private async clearPersistedState(): Promise<void> {
        try {
            await chrome.storage.local.remove(StorageKey.OverlayState);
        } catch (error) {
            console.warn('[Pixly] failed to clear overlay state:', error);
        }
    }

    private async restorePersistedState(): Promise<void> {
        if (!this.context || this.state) {
            return;
        }

        try {
            const stored = await chrome.storage.local.get(StorageKey.OverlayState);
            const value = stored[StorageKey.OverlayState] as PersistedOverlayState | undefined;

            if (!value || typeof value.dataUrl !== 'string') {
                return;
            }

            this.mountOverlay({
                dataUrl: value.dataUrl,
                naturalWidth: value.naturalWidth,
                naturalHeight: value.naturalHeight,
                width: value.width,
                height: value.height,
                positionX: value.positionX,
                positionY: value.positionY,
                opacity: this.context.settings.overlay.opacity ?? INITIAL_OPACITY,
                blendMode: this.context.settings.overlay.blendMode ?? INITIAL_BLEND_MODE,
                visible: true,
                locked: value.locked,
            });
            this.broadcastStateChange();
        } catch (error) {
            console.warn('[Pixly] failed to restore overlay state:', error);
        }
    }

    private broadcastStateChange(): void {
        const snapshot = this.getSnapshotState();
        // Fire-and-forget — the popup may not be open, which is fine.
        void sendMessageToRuntime({
            type: MessageType.OverlayStateChanged,
            payload: snapshot,
        });
    }
}
