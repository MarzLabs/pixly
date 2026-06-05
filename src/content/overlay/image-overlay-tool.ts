// Image overlay: lets the user drop a Figma export on top of the page with
// adjustable opacity, blend mode, drag-to-align, corner-handle resize,
// keyboard nudge and a lock toggle. Persists position, size and lock state
// per overlay session so they survive tab switches and full page reloads.

import { OVERLAY_LIGHT_DOM_Z_INDEX, OVERLAY_CONTAINER_ATTR } from '@/shared/constants/ui';
import { ColorToken } from '@/shared/constants/design-tokens';
import { StorageKey } from '@/shared/constants/storage';
import { MessageType } from '@/shared/types/messages';
import { sendMessageToRuntime } from '@/shared/messaging';
import { ensureShadowMount } from '../shadow-host';
import type { Tool, ToolContext } from '../tools/tool';
import {
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
        // The container lives in the light DOM so that mix-blend-mode blends
        // with the real page content. A Shadow DOM host with z-index creates
        // its own stacking context, which would prevent blending with anything
        // outside it.
        ensureShadowMount();

        // Purge any overlay containers orphaned by a prior (now-invalidated)
        // content-script instance. Without this, a hot-reload or manual extension
        // reload leaves the old container in the DOM — the new script then mounts
        // a second container, giving the user two overlays at once.
        document.body
            .querySelectorAll<HTMLDivElement>(`[${OVERLAY_CONTAINER_ATTR}]`)
            .forEach((orphan) => orphan.remove());

        this.state = { ...initial };
        this.container = this.buildContainer();
        document.body.appendChild(this.container);

        this.applyStyles();
        this.updateHandlesVisibility();

        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);
        document.addEventListener('keydown', this.handleKeyDown, true);
        document.addEventListener('mousedown', this.handleDocumentMouseDown, true);
    }

    private buildContainer(): HTMLDivElement {
        const container = document.createElement('div');

        // Defensive baseline: reset all inherited page styles so aggressive
        // global rules (e.g. `* { box-sizing: border-box; margin: 0 }`) cannot
        // corrupt the overlay layout. Individual properties are set explicitly
        // after the reset so nothing relies on browser defaults.
        //
        // position: absolute (relative to the document) so the overlay scrolls
        // with the page. position: fixed would pin it to the viewport, causing
        // it to appear to jump relative to page content on scroll.
        container.style.cssText = [
            'all: initial',
            'position: absolute',
            'top: 0',
            'left: 0',
            `z-index: ${String(OVERLAY_LIGHT_DOM_Z_INDEX)}`,
            'pointer-events: auto',
            'cursor: move',
            'user-select: none',
            'box-sizing: border-box',
            'outline: 0 solid transparent',
        ].join('; ');

        container.className = CLASS_CONTAINER;
        container.setAttribute(OVERLAY_CONTAINER_ATTR, 'true');

        this.img = document.createElement('img');
        this.img.alt = 'Pixly overlay';

        // Inline styles on the img prevent page CSS from overriding display or
        // dimensions that the tool manages exclusively via `applyStyles`.
        this.img.style.cssText = [
            'display: block',
            'width: 100%',
            'height: 100%',
            'pointer-events: none',
            'user-select: none',
        ].join('; ');

        container.appendChild(this.img);

        for (const handle of HANDLES) {
            const node = this.buildHandle(handle);
            container.appendChild(node);
        }

        container.addEventListener('mousedown', (event) => this.onContainerMouseDown(event));

        return container;
    }

    private buildHandle(handle: ResizeHandle): HTMLDivElement {
        const HANDLE_SIZE_PX = 12;
        const HANDLE_OFFSET_PX = -6;

        const node = document.createElement('div');
        node.className = `${CLASS_HANDLE} ${CLASS_HANDLE}--${handle}`;
        node.dataset.handle = handle;

        const cursorMap: Record<ResizeHandle, string> = {
            'top-left': 'nwse-resize',
            'top-right': 'nesw-resize',
            'bottom-left': 'nesw-resize',
            'bottom-right': 'nwse-resize',
        };

        const edgeStyles: Record<ResizeHandle, string> = {
            'top-left': `top: ${String(HANDLE_OFFSET_PX)}px; left: ${String(HANDLE_OFFSET_PX)}px`,
            'top-right': `top: ${String(HANDLE_OFFSET_PX)}px; right: ${String(HANDLE_OFFSET_PX)}px`,
            'bottom-left': `bottom: ${String(HANDLE_OFFSET_PX)}px; left: ${String(HANDLE_OFFSET_PX)}px`,
            'bottom-right': `bottom: ${String(HANDLE_OFFSET_PX)}px; right: ${String(HANDLE_OFFSET_PX)}px`,
        };

        node.style.cssText = [
            'all: initial',
            'position: absolute',
            `width: ${String(HANDLE_SIZE_PX)}px`,
            `height: ${String(HANDLE_SIZE_PX)}px`,
            `background: ${ColorToken.Selected}`,
            'border: 1px solid white',
            'border-radius: 2px',
            'box-shadow: 0 1px 2px rgba(0,0,0,0.25)',
            'z-index: 1',
            'box-sizing: border-box',
            `cursor: ${cursorMap[handle]}`,
            edgeStyles[handle],
        ].join('; ');

        node.addEventListener('mousedown', (event) => this.onHandleMouseDown(event, handle));

        return node;
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
        container.style.cursor = state.locked ? 'not-allowed' : 'move';

        const isSelected = this.selected && !state.locked;
        container.style.outline = isSelected ? `2px solid ${ColorToken.Selected}` : '0 solid transparent';
        container.style.outlineOffset = isSelected ? '2px' : '0';

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
            node.style.display = visible ? 'block' : 'none';
        });
    }

    private onContainerMouseDown(event: MouseEvent): void {
        if (!this.state) {
            return;
        }

        // Handles call stopPropagation on mousedown, so they never bubble here.
        // A non-null this.resize at this point means a previous resize ended
        // without a mouseup (pointer left the browser window while held).
        // Clear the stale state so drag can start normally.
        this.resize = null;

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

        // Begin drag and select. Use page coordinates (client + scroll) so the
        // overlay, which is position:absolute, moves correctly relative to the
        // document rather than the viewport.
        this.setSelected(true);
        this.drag = {
            pointerOffset: { x: event.clientX + window.scrollX, y: event.clientY + window.scrollY },
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

        const startRect: Rect = {
            x: this.state.positionX,
            y: this.state.positionY,
            width: this.state.width,
            height: this.state.height,
        };

        // Capture the offset from the pointer to the container corner that the
        // active handle sits on. This keeps that corner pinned exactly under the
        // cursor throughout the drag — without it, clicking anywhere other than
        // the exact corner produces an immediate size jump equal to the distance
        // from the click to the corner (the handle is offset HANDLE_OFFSET_PX px
        // outside the container, so the offset is always non-zero in practice).
        //
        // Corner positions are document-space; the pointer is viewport-space.
        // Convert the pointer to document-space by adding the current scroll
        // offset so the subtraction operates in the same coordinate system.
        const cornerX = handle.endsWith('right') ? startRect.x + startRect.width : startRect.x;
        const cornerY = handle.startsWith('bottom') ? startRect.y + startRect.height : startRect.y;
        const pageX = event.clientX + window.scrollX;
        const pageY = event.clientY + window.scrollY;

        this.resize = {
            handle,
            startRect,
            pointerOffset: { x: pageX - cornerX, y: pageY - cornerY },
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
            // Use page coordinates so drag distance is measured in document
            // space, matching the position:absolute coordinate system.
            const pageX = event.clientX + window.scrollX;
            const pageY = event.clientY + window.scrollY;
            const deltaX = pageX - this.drag.pointerOffset.x;
            const deltaY = pageY - this.drag.pointerOffset.y;

            this.state.positionX = this.drag.startPosition.x + deltaX;
            this.state.positionY = this.drag.startPosition.y + deltaY;
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

        // Convert the viewport-relative pointer to document-space coordinates
        // so the resize geometry operates in the same space as positionX/Y.
        const pageX = event.clientX + window.scrollX;
        const pageY = event.clientY + window.scrollY;

        const result = computeResize({
            handle: this.resize.handle,
            startRect: this.resize.startRect,
            pointer: { x: pageX, y: pageY },
            pointerOffset: this.resize.pointerOffset,
            naturalSize: { width: this.state.naturalWidth, height: this.state.naturalHeight },
            preserveAspectRatio: this.resize.preserveAspectRatio,
        });

        this.state.positionX = result.rect.x;
        this.state.positionY = result.rect.y;
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

        // positionX/Y are document coordinates; the tooltip lives in the shadow
        // host which is position:fixed, so convert to viewport coordinates by
        // subtracting the current scroll offset.
        const tooltipAnchorOffset = 12;
        const viewportX = this.state.positionX - window.scrollX;
        const viewportY = this.state.positionY - window.scrollY;

        this.tooltip.style.left = `${viewportX + this.state.width + tooltipAnchorOffset}px`;
        this.tooltip.style.top = `${viewportY + this.state.height + tooltipAnchorOffset}px`;
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

        // positionX/Y are document coordinates; the lock hint lives in the
        // shadow host (position:fixed), so convert to viewport coordinates.
        const hintViewportX = this.state.positionX - window.scrollX;
        const hintViewportY = this.state.positionY - window.scrollY;

        this.lockHint.style.left = `${hintViewportX + this.state.width / 2}px`;
        this.lockHint.style.top = `${hintViewportY + this.state.height / 2}px`;
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

        this.state.positionX = next.x;
        this.state.positionY = next.y;
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

            // Re-check after the async gap: loadImage() may have been called
            // while the storage read was in flight, mounting an overlay and
            // setting this.state. Calling mountOverlay() a second time would
            // create a duplicate container at the old persisted position (often
            // 0,0 from the initial-load persist), leaving a phantom element in
            // the DOM that becomes visually dominant once the user scales the
            // real overlay down.
            if (this.state) {
                return;
            }

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
