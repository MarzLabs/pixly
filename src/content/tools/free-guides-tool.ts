// Free guides: shows two rulers (top + left) while active. Dragging from a
// ruler drops a guide anywhere in the viewport, much like Figma or Photoshop.
// The guides themselves are managed by the shared GuideManager so selection,
// nudge and snap behave the same as guides created from the rulers tool.

import { applySnap, collectSnapCandidates, type GuideOrientation, type SnapCandidate } from '@/shared/utils/snap';
import { PIXLY_INTERACTIVE_ATTR } from '@/shared/constants/ui';
import { getGuideManager, type ManualGuide } from '../guides/guide-manager';
import { ensureShadowMount } from '../shadow-host';
import type { Tool, ToolContext } from './tool';

const RULER_THICKNESS_PX = 24;
const RULER_TICK_INTERVAL_PX = 5;
const RULER_LABEL_INTERVAL_PX = 50;
const RULER_MAJOR_TICK_INTERVAL_PX = 10;
const VIEWPORT_CLAMP_MARGIN_PX = 2;
const RULER_TICK_COLOR = 'rgba(244, 244, 245, 0.35)';
const RULER_LABEL_COLOR = 'rgba(244, 244, 245, 0.55)';
const RULER_FONT = '9px "SF Mono", Menlo, Consolas, monospace';
const RULER_TICK_HEIGHT_SMALL = 4;
const RULER_TICK_HEIGHT_MAJOR = 8;
const RULER_TICK_HEIGHT_LABEL = 12;

interface CreationDrag {
    orientation: GuideOrientation;
    tooltip: HTMLDivElement;
    candidates: SnapCandidate[];
    guide: ManualGuide | null;
}

export class FreeGuidesTool implements Tool {
    private context: ToolContext | null = null;
    private horizontalRuler: HTMLDivElement | null = null;
    private verticalRuler: HTMLDivElement | null = null;
    private horizontalCanvas: HTMLCanvasElement | null = null;
    private verticalCanvas: HTMLCanvasElement | null = null;
    private creationDrag: CreationDrag | null = null;
    private readonly handleHorizontalDown = (event: MouseEvent) => this.beginCreation('horizontal', event);
    private readonly handleVerticalDown = (event: MouseEvent) => this.beginCreation('vertical', event);
    private readonly handleMouseMove = this.onMouseMove.bind(this);
    private readonly handleMouseUp = this.onMouseUp.bind(this);
    private readonly handleResize = this.redrawRulers.bind(this);

    enable(context: ToolContext): void {
        this.context = context;
        this.installRulers();
        document.addEventListener('mousemove', this.handleMouseMove, true);
        document.addEventListener('mouseup', this.handleMouseUp, true);
        window.addEventListener('resize', this.handleResize, { passive: true });
        window.addEventListener('scroll', this.handleResize, { passive: true });
    }

    disable(): void {
        document.removeEventListener('mousemove', this.handleMouseMove, true);
        document.removeEventListener('mouseup', this.handleMouseUp, true);
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('scroll', this.handleResize);

        this.horizontalRuler?.remove();
        this.verticalRuler?.remove();
        this.horizontalRuler = null;
        this.verticalRuler = null;
        this.horizontalCanvas = null;
        this.verticalCanvas = null;
        this.cleanupCreation(false);
        this.context = null;
    }

    onEscape(): void {
        this.cleanupCreation(true);
    }

    // ---------- Ruler scaffolding ----------

    private installRulers(): void {
        const { layer } = ensureShadowMount();
        layer.classList.add('interactive');

        this.horizontalRuler = document.createElement('div');
        this.horizontalRuler.className = 'pixly-ruler horizontal';
        this.horizontalRuler.setAttribute(PIXLY_INTERACTIVE_ATTR, 'true');
        this.horizontalCanvas = document.createElement('canvas');
        this.horizontalCanvas.className = 'pixly-ruler-canvas';
        this.horizontalRuler.appendChild(this.horizontalCanvas);

        this.verticalRuler = document.createElement('div');
        this.verticalRuler.className = 'pixly-ruler vertical';
        this.verticalRuler.setAttribute(PIXLY_INTERACTIVE_ATTR, 'true');
        this.verticalCanvas = document.createElement('canvas');
        this.verticalCanvas.className = 'pixly-ruler-canvas';
        this.verticalRuler.appendChild(this.verticalCanvas);

        this.horizontalRuler.addEventListener('mousedown', this.handleHorizontalDown);
        this.verticalRuler.addEventListener('mousedown', this.handleVerticalDown);

        layer.appendChild(this.horizontalRuler);
        layer.appendChild(this.verticalRuler);

        this.redrawRulers();
    }

    private redrawRulers(): void {
        if (this.horizontalCanvas) {
            this.drawRuler(this.horizontalCanvas, 'horizontal');
        }

        if (this.verticalCanvas) {
            this.drawRuler(this.verticalCanvas, 'vertical');
        }
    }

    private drawRuler(canvas: HTMLCanvasElement, orientation: GuideOrientation): void {
        const ratio = window.devicePixelRatio || 1;
        const lengthCss = orientation === 'horizontal' ? window.innerWidth : window.innerHeight;
        const thicknessCss = RULER_THICKNESS_PX;

        const widthCss = orientation === 'horizontal' ? lengthCss : thicknessCss;
        const heightCss = orientation === 'horizontal' ? thicknessCss : lengthCss;

        canvas.style.width = `${widthCss}px`;
        canvas.style.height = `${heightCss}px`;
        canvas.width = Math.floor(widthCss * ratio);
        canvas.height = Math.floor(heightCss * ratio);

        const ctx = canvas.getContext('2d');

        if (!ctx) return;

        ctx.scale(ratio, ratio);
        ctx.clearRect(0, 0, widthCss, heightCss);
        ctx.fillStyle = RULER_TICK_COLOR;
        ctx.strokeStyle = RULER_TICK_COLOR;
        ctx.font = RULER_FONT;

        for (let px = 0; px <= lengthCss; px += RULER_TICK_INTERVAL_PX) {
            const isLabel = px % RULER_LABEL_INTERVAL_PX === 0;
            const isMajor = px % RULER_MAJOR_TICK_INTERVAL_PX === 0;
            const tickHeight = isLabel ? RULER_TICK_HEIGHT_LABEL : isMajor ? RULER_TICK_HEIGHT_MAJOR : RULER_TICK_HEIGHT_SMALL;

            if (orientation === 'horizontal') {
                ctx.fillRect(px, thicknessCss - tickHeight, 1, tickHeight);

                if (isLabel) {
                    ctx.fillStyle = RULER_LABEL_COLOR;
                    ctx.fillText(String(px), px + 2, thicknessCss - tickHeight - 2);
                    ctx.fillStyle = RULER_TICK_COLOR;
                }
            } else {
                ctx.fillRect(thicknessCss - tickHeight, px, tickHeight, 1);

                if (isLabel) {
                    ctx.fillStyle = RULER_LABEL_COLOR;
                    ctx.save();
                    ctx.translate(thicknessCss - tickHeight - 2, px - 2);
                    ctx.rotate(-Math.PI / 2);
                    ctx.fillText(String(px), 0, 0);
                    ctx.restore();
                    ctx.fillStyle = RULER_TICK_COLOR;
                }
            }
        }
    }

    // ---------- Creation flow ----------

    private beginCreation(orientation: GuideOrientation, event: MouseEvent): void {
        event.preventDefault();
        event.stopPropagation();

        const { layer } = ensureShadowMount();
        const tooltip = document.createElement('div');
        tooltip.className = 'pixly-ruler-tooltip';
        layer.appendChild(tooltip);

        const candidates = this.context?.settings.snap.enabled ? collectSnapCandidates(orientation) : [];

        this.creationDrag = {
            orientation,
            tooltip,
            candidates,
            guide: null,
        };

        this.updateCreation(event);
    }

    private onMouseMove(event: MouseEvent): void {
        if (!this.creationDrag) {
            return;
        }

        this.updateCreation(event);
    }

    private updateCreation(event: MouseEvent): void {
        if (!this.creationDrag) {
            return;
        }

        const { orientation, tooltip } = this.creationDrag;
        const isHorizontal = orientation === 'horizontal';
        let position = isHorizontal ? event.clientY : event.clientX;

        if (this.context?.settings.snap.enabled && !event.altKey) {
            const result = applySnap(position, this.creationDrag.candidates, this.context.settings.snap.thresholdPx);
            position = result.position;
        }

        const clampMax = isHorizontal ? window.innerHeight - VIEWPORT_CLAMP_MARGIN_PX : window.innerWidth - VIEWPORT_CLAMP_MARGIN_PX;
        position = Math.max(VIEWPORT_CLAMP_MARGIN_PX, Math.min(clampMax, position));

        const manager = getGuideManager();

        if (!this.creationDrag.guide) {
            this.creationDrag.guide = manager.createManualGuide(orientation, position);
        } else {
            manager.moveManualGuide(this.creationDrag.guide, position);
        }

        tooltip.textContent = `${isHorizontal ? 'Y' : 'X'}: ${Math.round(position)}px`;
        tooltip.style.left = `${event.clientX + 12}px`;
        tooltip.style.top = `${event.clientY + 12}px`;
    }

    private onMouseUp(_event: MouseEvent): void {
        if (!this.creationDrag) {
            return;
        }

        // Already created. Leave the guide selected so the user can nudge it.
        if (this.creationDrag.guide) {
            getGuideManager().selectManualGuide(this.creationDrag.guide);
        }

        this.cleanupCreation(false);
    }

    private cleanupCreation(removeGuide: boolean): void {
        if (!this.creationDrag) {
            return;
        }

        this.creationDrag.tooltip.remove();

        if (removeGuide && this.creationDrag.guide) {
            getGuideManager().removeManualGuide(this.creationDrag.guide);
        }

        this.creationDrag = null;
    }
}
