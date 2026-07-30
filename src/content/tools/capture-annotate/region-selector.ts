import { normalizedRect } from './annotation-geometry';
import type { CaptureRegion, RegionPick } from './capture-region';

/**
 * Drag-to-select overlay for area captures, all imperative DOM inside the Shadow DOM. A
 * full-viewport surface swallows page interaction while a marquee with a live size readout
 * tracks the drag. Resolves with the selected viewport region, or null on cancel (Esc,
 * pointercancel, external cancel() or a zero-size drag). The overlay removes itself before
 * resolving, so the subsequent capture never photographs it.
 */
export function selectRegion(parent: HTMLElement): RegionPick {
  let finishRef: (region: CaptureRegion | null) => void = () => {};

  const result = new Promise<CaptureRegion | null>((resolve) => {
    const surface = document.createElement('div');
    surface.className = 'pixly-capture-picker';

    const hint = document.createElement('div');
    hint.className = 'pixly-capture-picker__hint';
    hint.textContent = 'Drag to select the area to capture — Esc cancels';
    surface.appendChild(hint);

    const marquee = document.createElement('div');
    marquee.className = 'pixly-capture-marquee';
    const label = document.createElement('span');
    label.className = 'pixly-capture-marquee__label';
    marquee.appendChild(label);
    surface.appendChild(marquee);

    let start: { x: number; y: number } | null = null;

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

    surface.addEventListener('pointerdown', (event) => {
      if (!event.isPrimary || event.button !== 0) {
        return;
      }

      event.preventDefault();
      surface.setPointerCapture(event.pointerId);
      start = { x: event.clientX, y: event.clientY };
      hint.style.display = 'none';
    });

    surface.addEventListener('pointermove', (event) => {
      if (!start) {
        return;
      }

      const rect = normalizedRect(start, { x: event.clientX, y: event.clientY });
      marquee.style.display = 'block';
      marquee.style.left = `${rect.left}px`;
      marquee.style.top = `${rect.top}px`;
      marquee.style.width = `${rect.width}px`;
      marquee.style.height = `${rect.height}px`;
      label.textContent = `${Math.round(rect.width)} × ${Math.round(rect.height)}`;
    });

    surface.addEventListener('pointerup', (event) => {
      if (!start) {
        return;
      }

      const rect = normalizedRect(start, { x: event.clientX, y: event.clientY });
      finish(rect.width > 0 && rect.height > 0 ? rect : null);
    });

    surface.addEventListener('pointercancel', () => finish(null));

    window.addEventListener('keydown', onKeyDown, true);
    parent.appendChild(surface);
  });

  return { result, cancel: () => finishRef(null) };
}
