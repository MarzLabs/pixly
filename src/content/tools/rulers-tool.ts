// Rulers v2: drag from anywhere to drop a horizontal or vertical guide. The
// gesture's dominant axis decides the orientation. New behaviours:
// - Snap to element edges/centers/baselines while dragging.
// - Alt temporarily disables snap (Figma-style).
// - Click selects a guide; arrow keys nudge it; Delete removes it.

import { applySnap, collectSnapCandidates, type GuideOrientation, type SnapCandidate } from '@/shared/utils/snap';
import { isInsidePixlyUi, isInsidePixlyInteractivePanel } from '@/shared/utils/dom';
import { getGuideManager, type ManualGuide } from '../guides/guide-manager';
import { ensureShadowMount } from '../shadow-host';
import type { Tool, ToolContext } from './tool';

const MIN_DRAG_PX = 10;
const SNAP_DISABLE_KEY = 'Alt';
const DELETE_KEY = 'Delete';
const BACKSPACE_KEY = 'Backspace';
const ARROW_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

interface DragState {
    guide: ManualGuide;
    pointerOffset: number;
    candidates: SnapCandidate[];
    altPressed: boolean;
    indicator: HTMLDivElement | null;
}

export class RulersTool implements Tool {
    private context: ToolContext | null = null;
    private gestureStart: { x: number; y: number } | null = null;
    private activeDrag: DragState | null = null;
    private readonly handleMouseDown = this.onMouseDown.bind(this);
    private readonly handleMouseUp = this.onMouseUp.bind(this);
    private readonly handleMouseMove = this.onMouseMove.bind(this);
    private readonly handleKeyDown = this.onKeyDown.bind(this);
    private readonly handleKeyUp = this.onKeyUp.bind(this);
    private readonly handleDocumentClick = this.onDocumentClick.bind(this);

    enable(context: ToolContext): void {
        this.context = context;
        ensureShadowMount();

        const manager = getGuideManager();
        manager.setGuideClickHandler((guide, event) => this.onGuideMouseDown(guide, event));

        document.addEventListener('mousedown', this.handleMouseDown, true);
        document.addEventListener('mouseup', this.handleMouseUp, true);
        document.addEventListener('mousemove', this.handleMouseMove, true);
        document.addEventListener('keydown', this.handleKeyDown, true);
        document.addEventListener('keyup', this.handleKeyUp, true);
        document.addEventListener('click', this.handleDocumentClick, true);
    }

    disable(): void {
        document.removeEventListener('mousedown', this.handleMouseDown, true);
        document.removeEventListener('mouseup', this.handleMouseUp, true);
        document.removeEventListener('mousemove', this.handleMouseMove, true);
        document.removeEventListener('keydown', this.handleKeyDown, true);
        document.removeEventListener('keyup', this.handleKeyUp, true);
        document.removeEventListener('click', this.handleDocumentClick, true);

        const manager = getGuideManager();
        manager.setGuideClickHandler(null);
        manager.clearManualGuides();
        this.context = null;
        this.gestureStart = null;
        this.cleanupDrag();
    }

    onEscape(): void {
        getGuideManager().clearSelection();
    }

    // ---------- Creating new guides via drag in empty space ----------

    private onMouseDown(event: MouseEvent): void {
        // Only the deepest target (first Element in composedPath) is checked.
        // isInsidePixlyInteractivePanel is used instead of isInsidePixlyUi:
        // when the layer has pointer-events:auto the deepest composedPath element
        // is always inside the shadow DOM, so isInsidePixlyUi would block every
        // legitimate page interaction.
        const deepestTarget = event.composedPath().find((node): node is Element => node instanceof Element);

        if (deepestTarget && isInsidePixlyInteractivePanel(deepestTarget)) {
            // Drag started inside a Pixly interactive surface (guide or ruler);
            // the GuideManager click handler takes care of guide drags.
            return;
        }

        this.gestureStart = { x: event.clientX, y: event.clientY };
    }

    private onMouseUp(event: MouseEvent): void {
        if (this.activeDrag) {
            this.cleanupDrag();

            return;
        }

        if (!this.gestureStart) {
            return;
        }

        const dx = event.clientX - this.gestureStart.x;
        const dy = event.clientY - this.gestureStart.y;
        const start = this.gestureStart;
        this.gestureStart = null;

        if (Math.abs(dx) < MIN_DRAG_PX && Math.abs(dy) < MIN_DRAG_PX) {
            return;
        }

        const orientation: GuideOrientation = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
        let position = orientation === 'horizontal' ? event.clientY : event.clientX;

        if (this.context?.settings.snap.enabled && !event.altKey) {
            const candidates = collectSnapCandidates(orientation);
            const result = applySnap(position, candidates, this.context.settings.snap.thresholdPx);
            position = result.position;
        }

        const guide = getGuideManager().createManualGuide(orientation, position);
        getGuideManager().selectManualGuide(guide);

        // Silence the unused-variable warning while signalling intent.
        void start;
    }

    private onMouseMove(event: MouseEvent): void {
        if (!this.activeDrag) {
            return;
        }

        const orientation = this.activeDrag.guide.orientation;
        const pointer = orientation === 'horizontal' ? event.clientY : event.clientX;
        let nextPosition = pointer - this.activeDrag.pointerOffset;
        let activeCandidate: SnapCandidate | null = null;

        if (this.context?.settings.snap.enabled && !event.altKey) {
            const result = applySnap(nextPosition, this.activeDrag.candidates, this.context.settings.snap.thresholdPx);
            nextPosition = result.position;
            activeCandidate = result.candidate;
        }

        this.activeDrag.altPressed = event.altKey;
        this.updateSnapIndicator(orientation, nextPosition, activeCandidate);

        getGuideManager().moveManualGuide(this.activeDrag.guide, nextPosition);
        this.activeDrag.guide.element.classList.toggle('snapping', activeCandidate !== null);
    }

    private onGuideMouseDown(guide: ManualGuide, event: MouseEvent): void {
        event.stopPropagation();
        event.preventDefault();

        getGuideManager().selectManualGuide(guide);

        const pointer = guide.orientation === 'horizontal' ? event.clientY : event.clientX;
        const candidates = this.context?.settings.snap.enabled
            ? collectSnapCandidates(guide.orientation)
            : [];

        this.activeDrag = {
            guide,
            pointerOffset: pointer - guide.position,
            candidates,
            altPressed: event.altKey,
            indicator: null,
        };
    }

    private onDocumentClick(event: MouseEvent): void {
        // Only the deepest target (first Element in composedPath) is checked.
        // isInsidePixlyInteractivePanel is used instead of isInsidePixlyUi:
        // when the layer has pointer-events:auto the deepest composedPath element
        // is always inside the shadow DOM, so isInsidePixlyUi would block every
        // legitimate page click.
        const deepestTarget = event.composedPath().find((node): node is Element => node instanceof Element);

        if (deepestTarget && isInsidePixlyInteractivePanel(deepestTarget)) {
            return;
        }

        // Clicking outside any guide clears the selection.
        getGuideManager().clearSelection();
    }

    // ---------- Keyboard handling ----------

    private onKeyDown(event: KeyboardEvent): void {
        const manager = getGuideManager();
        const selected = manager.getSelectedGuide();

        if ((event.key === DELETE_KEY || event.key === BACKSPACE_KEY) && selected) {
            event.preventDefault();
            event.stopPropagation();
            manager.deleteSelected();

            return;
        }

        if (ARROW_KEYS.has(event.key) && selected) {
            event.preventDefault();
            event.stopPropagation();

            const large = event.shiftKey;

            switch (event.key) {
                case 'ArrowUp':
                    manager.nudgeSelected('up', large);
                    break;
                case 'ArrowDown':
                    manager.nudgeSelected('down', large);
                    break;
                case 'ArrowLeft':
                    manager.nudgeSelected('left', large);
                    break;
                case 'ArrowRight':
                    manager.nudgeSelected('right', large);
                    break;
                default:
                    break;
            }
        }
    }

    private onKeyUp(event: KeyboardEvent): void {
        // Toggle snap behavior when Alt is released mid-drag.
        if (event.key === SNAP_DISABLE_KEY && this.activeDrag) {
            this.activeDrag.altPressed = false;
        }
    }

    // ---------- Snap indicator ----------

    private updateSnapIndicator(
        orientation: GuideOrientation,
        position: number,
        candidate: SnapCandidate | null,
    ): void {
        const { layer } = ensureShadowMount();

        if (!candidate) {
            this.activeDrag?.indicator?.remove();

            if (this.activeDrag) {
                this.activeDrag.indicator = null;
            }

            return;
        }

        if (!this.activeDrag) {
            return;
        }

        if (!this.activeDrag.indicator) {
            this.activeDrag.indicator = document.createElement('div');
            this.activeDrag.indicator.className = 'pixly-snap-indicator';
            layer.appendChild(this.activeDrag.indicator);
        }

        const indicator = this.activeDrag.indicator;
        const targetRect = candidate.target.getBoundingClientRect();
        const x = orientation === 'horizontal' ? targetRect.left + targetRect.width / 2 : position;
        const y = orientation === 'horizontal' ? position : targetRect.top + targetRect.height / 2;
        indicator.style.left = `${x}px`;
        indicator.style.top = `${y}px`;
        indicator.title = candidate.kind;
    }

    private cleanupDrag(): void {
        if (this.activeDrag?.guide) {
            this.activeDrag.guide.element.classList.remove('snapping');
        }

        this.activeDrag?.indicator?.remove();
        this.activeDrag = null;
    }
}
