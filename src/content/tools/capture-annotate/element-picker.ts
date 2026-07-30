import { SHADOW_HOST_ID } from '@shared/constants';
import type { CaptureRegion, RegionPick } from './capture-region';
import { clampRegionToViewport } from './capture-region';

/**
 * DevTools-style element picker for element captures, all imperative DOM inside the Shadow DOM.
 * Hovering highlights the element under the pointer (box + identity/size tag), clicking resolves
 * with its viewport rect clipped to the visible area (captureVisibleTab cannot see beyond it),
 * Esc or an external cancel() resolves null. The overlay removes itself before resolving, so
 * the capture never photographs it.
 */
export function pickElementRegion(parent: HTMLElement): RegionPick {
  let finishRef: (region: CaptureRegion | null) => void = () => {};

  const result = new Promise<CaptureRegion | null>((resolve) => {
    const surface = document.createElement('div');
    surface.className = 'pixly-capture-picker';

    const hint = document.createElement('div');
    hint.className = 'pixly-capture-picker__hint';
    hint.textContent = 'Click the element to capture — Esc cancels';
    surface.appendChild(hint);

    const highlight = document.createElement('div');
    highlight.className = 'pixly-capture-highlight';
    const tag = document.createElement('span');
    tag.className = 'pixly-capture-highlight__tag';
    highlight.appendChild(tag);
    surface.appendChild(highlight);

    let current: Element | null = null;

    const finish = (region: CaptureRegion | null): void => {
      window.removeEventListener('keydown', onKeyDown, true);
      surface.remove();
      resolve(region);
    };

    finishRef = finish;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        finish(null);
      }
    };

    surface.addEventListener('pointermove', (event) => {
      current = elementAt(event.clientX, event.clientY);

      if (!current) {
        highlight.style.display = 'none';

        return;
      }

      const rect = current.getBoundingClientRect();
      highlight.style.display = 'block';
      highlight.style.left = `${rect.left}px`;
      highlight.style.top = `${rect.top}px`;
      highlight.style.width = `${rect.width}px`;
      highlight.style.height = `${rect.height}px`;
      tag.textContent = `${describeElement(current)} — ${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    });

    surface.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0) {
        return;
      }

      event.preventDefault();
      const target = current ?? elementAt(event.clientX, event.clientY);

      if (!target) {
        finish(null);

        return;
      }

      const rect = target.getBoundingClientRect();
      finish(
        clampRegionToViewport(
          { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
          window.innerWidth,
          window.innerHeight,
        ),
      );
    });

    window.addEventListener('keydown', onKeyDown, true);
    parent.appendChild(surface);
  });

  return { result, cancel: () => finishRef(null) };
}

/**
 * Topmost page element under the point. elementsFromPoint returns light-DOM elements, so the
 * only Pixly entry that can appear is the shadow host itself (the picker surface lives inside
 * its shadow root) — skip it, plus the root <html> element, which is never what the user means.
 */
function elementAt(x: number, y: number): Element | null {
  for (const element of document.elementsFromPoint(x, y)) {
    if (element.id === SHADOW_HOST_ID || element === document.documentElement) {
      continue;
    }

    return element;
  }

  return null;
}

/** DevTools-style identity: tag, id and up to two classes (SVG className is not a string). */
function describeElement(element: Element): string {
  const id = element.id ? `#${element.id}` : '';
  const classAttr = element.getAttribute('class') ?? '';
  const classes = classAttr.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  const cls = classes.length > 0 ? `.${classes.join('.')}` : '';

  return `${element.tagName.toLowerCase()}${id}${cls}`;
}
