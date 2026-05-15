// Image overlay: lets the user drop a Figma export on top of the page with
// adjustable opacity, blend mode and drag-to-align.

import { OVERLAY_Z_INDEX } from '@/shared/constants/ui';
import { ensureShadowMount } from '../shadow-host';
import type { Tool, ToolContext } from '../tools/tool';

const INITIAL_OPACITY = 0.5;
const INITIAL_BLEND_MODE = 'normal';

interface OverlayState {
    dataUrl: string;
    width: number;
    height: number;
    positionX: number;
    positionY: number;
    opacity: number;
    blendMode: string;
    visible: boolean;
    scale: number;
}

export class ImageOverlayTool implements Tool {
    private context: ToolContext | null = null;
    private container: HTMLDivElement | null = null;
    private img: HTMLImageElement | null = null;
    private state: OverlayState | null = null;
    private dragOffset: { x: number; y: number } | null = null;
    private readonly handleMouseMove = this.onMouseMove.bind(this);
    private readonly handleMouseUp = this.onMouseUp.bind(this);

    enable(context: ToolContext): void {
        this.context = context;
        ensureShadowMount();
    }

    disable(): void {
        this.removeImage();
        this.context = null;
    }

    loadImage(dataUrl: string, width: number, height: number): void {
        if (!this.context) {
            return;
        }

        this.removeImage();

        const { layer } = ensureShadowMount();
        layer.classList.add('interactive');

        const initialOpacity = this.context.settings.overlay.opacity ?? INITIAL_OPACITY;
        const initialBlendMode = this.context.settings.overlay.blendMode ?? INITIAL_BLEND_MODE;

        this.state = {
            dataUrl,
            width,
            height,
            positionX: 0,
            positionY: 0,
            opacity: initialOpacity,
            blendMode: initialBlendMode,
            visible: true,
            scale: 1,
        };

        this.container = document.createElement('div');
        this.container.className = 'pixly-image-overlay';
        this.container.style.zIndex = String(OVERLAY_Z_INDEX);
        this.container.style.left = '0';
        this.container.style.top = '0';
        this.container.style.width = `${width}px`;
        this.container.style.height = `${height}px`;
        this.container.style.opacity = String(initialOpacity);
        this.container.style.mixBlendMode = initialBlendMode;

        this.img = document.createElement('img');
        this.img.src = dataUrl;
        this.img.alt = 'Pixly overlay';
        this.container.appendChild(this.img);

        this.container.addEventListener('mousedown', (event) => {
            this.dragOffset = {
                x: event.clientX - (this.state?.positionX ?? 0),
                y: event.clientY - (this.state?.positionY ?? 0),
            };
            event.preventDefault();
        });

        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);

        layer.appendChild(this.container);
    }

    updateState(patch: Partial<Pick<OverlayState, 'opacity' | 'blendMode' | 'positionX' | 'positionY' | 'visible' | 'scale'>>): void {
        if (!this.state || !this.container) {
            return;
        }

        Object.assign(this.state, patch);

        this.container.style.opacity = String(this.state.opacity);
        this.container.style.mixBlendMode = this.state.blendMode;
        this.container.style.transform = `translate(${this.state.positionX}px, ${this.state.positionY}px) scale(${this.state.scale})`;
        this.container.style.display = this.state.visible ? 'block' : 'none';
    }

    removeImage(): void {
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
        this.container?.remove();
        this.container = null;
        this.img = null;
        this.state = null;
        this.dragOffset = null;
    }

    toggleVisibility(): void {
        if (!this.state) {
            return;
        }

        this.updateState({ visible: !this.state.visible });
    }

    private onMouseMove(event: MouseEvent): void {
        if (!this.dragOffset || !this.state) {
            return;
        }

        const positionX = event.clientX - this.dragOffset.x;
        const positionY = event.clientY - this.dragOffset.y;
        this.updateState({ positionX, positionY });
    }

    private onMouseUp(): void {
        this.dragOffset = null;
    }
}
