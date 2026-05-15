// Snap engine: given a candidate position, a guide orientation and a set of
// visible elements, decide whether the position should snap to a nearby edge,
// center or baseline. Pure functions only so they are easy to unit test.

import { isElementVisible, isInsidePixlyUi } from './dom';

export type GuideOrientation = 'horizontal' | 'vertical';

export type SnapKind = 'edge' | 'center' | 'baseline';

export interface SnapCandidate {
    position: number;
    kind: SnapKind;
    target: Element;
}

export interface SnapResult {
    position: number;
    candidate: SnapCandidate | null;
}

const PRIORITY_BY_KIND: Record<SnapKind, number> = {
    edge: 0,
    center: 1,
    baseline: 2,
};

// Limit how many elements we evaluate to keep the gesture smooth on dense
// pages. Inspired by the sad-path scenario 5 in the spec.
export const SNAP_MAX_CANDIDATES = 200;

export function collectSnapCandidates(
    orientation: GuideOrientation,
    documentRoot: Document = document,
): SnapCandidate[] {
    const candidates: SnapCandidate[] = [];
    const elements = documentRoot.querySelectorAll<HTMLElement>('body *');
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    let processed = 0;

    for (const element of elements) {
        if (processed >= SNAP_MAX_CANDIDATES) {
            break;
        }

        if (isInsidePixlyUi(element) || !isElementVisible(element)) {
            continue;
        }

        const rect = element.getBoundingClientRect();

        // Skip elements outside the viewport so we don't pay the rect cost.
        if (rect.bottom < 0 || rect.top > viewportHeight) {
            continue;
        }

        if (rect.right < 0 || rect.left > viewportWidth) {
            continue;
        }

        processed += 1;

        if (orientation === 'horizontal') {
            candidates.push({ position: rect.top, kind: 'edge', target: element });
            candidates.push({ position: rect.bottom, kind: 'edge', target: element });
            candidates.push({ position: rect.top + rect.height / 2, kind: 'center', target: element });

            const baseline = computeTextBaseline(element, rect);

            if (baseline !== null) {
                candidates.push({ position: baseline, kind: 'baseline', target: element });
            }
        } else {
            candidates.push({ position: rect.left, kind: 'edge', target: element });
            candidates.push({ position: rect.right, kind: 'edge', target: element });
            candidates.push({ position: rect.left + rect.width / 2, kind: 'center', target: element });
        }
    }

    return candidates;
}

// Compute the approximate text baseline of an element by combining its top
// position, font size and the natural baseline offset (~80% of line height).
const BASELINE_RATIO = 0.8;

function computeTextBaseline(element: HTMLElement, rect: DOMRect): number | null {
    const style = getComputedStyle(element);

    if (!element.textContent || element.textContent.trim().length === 0) {
        return null;
    }

    const fontSize = parseFloat(style.fontSize);

    if (Number.isNaN(fontSize)) {
        return null;
    }

    return rect.top + fontSize * BASELINE_RATIO;
}

// Find the snap candidate closest to `position` within `thresholdPx`. Ties are
// broken by candidate priority (edge > center > baseline). Returns the original
// position when no candidate is within range.
export function applySnap(
    position: number,
    candidates: SnapCandidate[],
    thresholdPx: number,
): SnapResult {
    let bestCandidate: SnapCandidate | null = null;
    let bestDistance = thresholdPx + 1;

    for (const candidate of candidates) {
        const distance = Math.abs(candidate.position - position);

        if (distance > thresholdPx) {
            continue;
        }

        if (distance < bestDistance) {
            bestCandidate = candidate;
            bestDistance = distance;

            continue;
        }

        if (distance === bestDistance && bestCandidate) {
            const incomingPriority = PRIORITY_BY_KIND[candidate.kind];
            const currentPriority = PRIORITY_BY_KIND[bestCandidate.kind];

            if (incomingPriority < currentPriority) {
                bestCandidate = candidate;
            }
        }
    }

    if (!bestCandidate) {
        return { position, candidate: null };
    }

    return { position: bestCandidate.position, candidate: bestCandidate };
}
