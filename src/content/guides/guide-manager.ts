// Central manager for visual guides. Two kinds of guides coexist:
// - Manual guides (created by the user via RulersTool or FreeGuidesTool): can
//   be selected, nudged with the keyboard and removed with Delete/Backspace.
// - Auto guides (created when an element is pinned by DistanceMeterTool):
//   read-only visual layer that disappears once the element is un-pinned.
//
// Multiple tools share a single instance so selection state, snap behaviour
// and pair-distance indicators stay coherent.

import { NUDGE_LARGE_STEP_PX, NUDGE_STEP_PX, PIXLY_INTERACTIVE_ATTR } from '@/shared/constants/ui';
import { ColorToken, ZIndex } from '@/shared/constants/design-tokens';
import type { GuideOrientation } from '@/shared/utils/snap';
import { ensureShadowMount } from '../shadow-host';

const HORIZONTAL_GUIDE_HIT_AREA_PX = 6;
const PAIR_LABEL_OFFSET_PX = 4;

let manualGuideIdCounter = 0;
let autoGuideIdCounter = 0;

export interface ManualGuide {
    id: number;
    element: HTMLDivElement;
    orientation: GuideOrientation;
    position: number;
    selected: boolean;
}

export interface AutoGuide {
    id: number;
    element: HTMLDivElement;
    orientation: GuideOrientation;
    position: number;
    sourceLabel: string;
}

export type GuideClickHandler = (guide: ManualGuide, event: MouseEvent) => void;

export class GuideManager {
    private readonly manualGuides: ManualGuide[] = [];
    private readonly autoGuides: AutoGuide[] = [];
    private readonly pairLabels: HTMLDivElement[] = [];
    private selectedGuide: ManualGuide | null = null;
    private guideClickHandler: GuideClickHandler | null = null;

    setGuideClickHandler(handler: GuideClickHandler | null): void {
        this.guideClickHandler = handler;
    }

    // ---------- Manual guides ----------

    createManualGuide(orientation: GuideOrientation, position: number): ManualGuide {
        const { layer } = ensureShadowMount();
        layer.classList.add('interactive');

        const element = document.createElement('div');
        element.className = `pixly-guide ${orientation}`;
        element.setAttribute(PIXLY_INTERACTIVE_ATTR, 'true');
        element.style.zIndex = String(ZIndex.ManualGuide);

        this.applyPosition(element, orientation, position);

        manualGuideIdCounter += 1;
        const guide: ManualGuide = {
            id: manualGuideIdCounter,
            element,
            orientation,
            position,
            selected: false,
        };

        element.addEventListener('mousedown', (event) => {
            this.guideClickHandler?.(guide, event);
        });

        layer.appendChild(element);
        this.manualGuides.push(guide);
        this.refreshPairLabels();

        return guide;
    }

    moveManualGuide(guide: ManualGuide, position: number): void {
        guide.position = position;
        this.applyPosition(guide.element, guide.orientation, position);
        this.refreshPairLabels();
    }

    removeManualGuide(guide: ManualGuide): void {
        const index = this.manualGuides.indexOf(guide);

        if (index < 0) {
            return;
        }

        guide.element.remove();
        this.manualGuides.splice(index, 1);

        if (this.selectedGuide === guide) {
            this.selectedGuide = null;
        }

        this.refreshPairLabels();
    }

    selectManualGuide(guide: ManualGuide | null): void {
        if (this.selectedGuide && this.selectedGuide !== guide) {
            this.selectedGuide.selected = false;
            this.selectedGuide.element.classList.remove('selected');
        }

        this.selectedGuide = guide;

        if (guide) {
            guide.selected = true;
            guide.element.classList.add('selected');
        }
    }

    clearSelection(): void {
        this.selectManualGuide(null);
    }

    getSelectedGuide(): ManualGuide | null {
        return this.selectedGuide;
    }

    nudgeSelected(direction: 'up' | 'down' | 'left' | 'right', large: boolean): boolean {
        if (!this.selectedGuide) {
            return false;
        }

        const step = large ? NUDGE_LARGE_STEP_PX : NUDGE_STEP_PX;
        const guide = this.selectedGuide;

        if (guide.orientation === 'horizontal' && (direction === 'up' || direction === 'down')) {
            const delta = direction === 'up' ? -step : step;
            this.moveManualGuide(guide, guide.position + delta);

            return true;
        }

        if (guide.orientation === 'vertical' && (direction === 'left' || direction === 'right')) {
            const delta = direction === 'left' ? -step : step;
            this.moveManualGuide(guide, guide.position + delta);

            return true;
        }

        return false;
    }

    deleteSelected(): boolean {
        if (!this.selectedGuide) {
            return false;
        }

        this.removeManualGuide(this.selectedGuide);

        return true;
    }

    listManualGuides(): readonly ManualGuide[] {
        return this.manualGuides;
    }

    clearManualGuides(): void {
        for (const guide of [...this.manualGuides]) {
            this.removeManualGuide(guide);
        }
    }

    // ---------- Auto guides (read-only layer attached to a pinned element) ----------

    createAutoGuide(orientation: GuideOrientation, position: number, sourceLabel: string): AutoGuide {
        const { layer } = ensureShadowMount();

        const element = document.createElement('div');
        element.className = `pixly-auto-guide ${orientation}`;
        element.style.zIndex = String(ZIndex.AutoGuide);
        element.style.background = ColorToken.AutoGuide;

        this.applyPosition(element, orientation, position);

        autoGuideIdCounter += 1;
        const guide: AutoGuide = {
            id: autoGuideIdCounter,
            element,
            orientation,
            position,
            sourceLabel,
        };

        layer.appendChild(element);
        this.autoGuides.push(guide);

        return guide;
    }

    updateAutoGuide(guide: AutoGuide, position: number): void {
        guide.position = position;
        this.applyPosition(guide.element, guide.orientation, position);
    }

    clearAutoGuides(): void {
        for (const guide of this.autoGuides) {
            guide.element.remove();
        }

        this.autoGuides.length = 0;
    }

    listAutoGuides(): readonly AutoGuide[] {
        return this.autoGuides;
    }

    // ---------- Pair-distance labels ----------

    // Re-renders the labels that appear between two parallel manual guides.
    // We only show distances between consecutive guides of the same axis to
    // avoid the "N choose 2" combinatorial explosion mentioned in the spec.
    private refreshPairLabels(): void {
        for (const label of this.pairLabels) {
            label.remove();
        }

        this.pairLabels.length = 0;

        const horizontal = this.manualGuides
            .filter((guide) => guide.orientation === 'horizontal')
            .sort((a, b) => a.position - b.position);
        const vertical = this.manualGuides
            .filter((guide) => guide.orientation === 'vertical')
            .sort((a, b) => a.position - b.position);

        for (let index = 0; index < horizontal.length - 1; index += 1) {
            const top = horizontal[index];
            const bottom = horizontal[index + 1];
            this.createPairLabel('horizontal', top.position, bottom.position);
        }

        for (let index = 0; index < vertical.length - 1; index += 1) {
            const leftGuide = vertical[index];
            const rightGuide = vertical[index + 1];
            this.createPairLabel('vertical', leftGuide.position, rightGuide.position);
        }
    }

    private createPairLabel(orientation: GuideOrientation, positionA: number, positionB: number): void {
        const { layer } = ensureShadowMount();
        const distance = Math.round(Math.abs(positionB - positionA));

        if (distance === 0) {
            return;
        }

        const label = document.createElement('div');
        label.className = 'pixly-guide-pair-label';
        label.textContent = `${distance}px`;

        if (orientation === 'horizontal') {
            label.style.top = `${(positionA + positionB) / 2}px`;
            label.style.left = `${PAIR_LABEL_OFFSET_PX}px`;
        } else {
            label.style.left = `${(positionA + positionB) / 2}px`;
            label.style.top = `${PAIR_LABEL_OFFSET_PX}px`;
        }

        layer.appendChild(label);
        this.pairLabels.push(label);
    }

    // ---------- Shared helpers ----------

    private applyPosition(element: HTMLDivElement, orientation: GuideOrientation, position: number): void {
        if (orientation === 'horizontal') {
            element.style.top = `${position}px`;
            element.style.left = '0';
            element.style.width = '100%';
            element.style.height = `${HORIZONTAL_GUIDE_HIT_AREA_PX}px`;
            element.style.marginTop = `-${HORIZONTAL_GUIDE_HIT_AREA_PX / 2}px`;
        } else {
            element.style.left = `${position}px`;
            element.style.top = '0';
            element.style.height = '100%';
            element.style.width = `${HORIZONTAL_GUIDE_HIT_AREA_PX}px`;
            element.style.marginLeft = `-${HORIZONTAL_GUIDE_HIT_AREA_PX / 2}px`;
        }
    }

    dispose(): void {
        this.clearManualGuides();
        this.clearAutoGuides();
        this.selectedGuide = null;
    }
}

// Singleton used by every tool that touches guides.
let sharedManager: GuideManager | null = null;

export function getGuideManager(): GuideManager {
    if (!sharedManager) {
        sharedManager = new GuideManager();
    }

    return sharedManager;
}
