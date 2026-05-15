// Tracks visual styles (background, outline) applied by Pixly so they can be
// cleared in bulk and on page reload (page reload happens automatically because
// these are inline styles on DOM nodes; the whole DOM is rebuilt).

const APPLIED_BG_ATTR = 'data-pixly-bg';
const APPLIED_OUTLINE_ATTR = 'data-pixly-outline';

interface PreviousStyle {
    backgroundColor?: string;
    outline?: string;
    outlineOffset?: string;
}

const previousStyles = new WeakMap<HTMLElement, PreviousStyle>();

function rememberStyle(element: HTMLElement, key: keyof PreviousStyle): void {
    const stored = previousStyles.get(element) ?? {};

    if (stored[key] !== undefined) {
        return;
    }

    stored[key] = element.style[key as 'backgroundColor' | 'outline' | 'outlineOffset'];
    previousStyles.set(element, stored);
}

export function applyBackgroundColor(element: HTMLElement, color: string): void {
    rememberStyle(element, 'backgroundColor');
    element.style.backgroundColor = color;
    element.setAttribute(APPLIED_BG_ATTR, color);
}

export function applyOutline(element: HTMLElement, color: string, thicknessPx: number): void {
    rememberStyle(element, 'outline');
    rememberStyle(element, 'outlineOffset');
    element.style.outline = `${thicknessPx}px solid ${color}`;
    element.style.outlineOffset = '0';
    element.setAttribute(APPLIED_OUTLINE_ATTR, color);
}

export function clearAllAppliedStyles(): void {
    const backgrounds = document.querySelectorAll<HTMLElement>(`[${APPLIED_BG_ATTR}]`);

    for (const el of backgrounds) {
        const stored = previousStyles.get(el);
        el.style.backgroundColor = stored?.backgroundColor ?? '';
        el.removeAttribute(APPLIED_BG_ATTR);
    }

    const outlines = document.querySelectorAll<HTMLElement>(`[${APPLIED_OUTLINE_ATTR}]`);

    for (const el of outlines) {
        const stored = previousStyles.get(el);
        el.style.outline = stored?.outline ?? '';
        el.style.outlineOffset = stored?.outlineOffset ?? '';
        el.removeAttribute(APPLIED_OUTLINE_ATTR);
    }
}
