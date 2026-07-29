import { describe, expect, it, vi } from 'vitest';
import { DragController } from '@content/tools/image-overlay/drag-controller';
import { ResizeController } from '@content/tools/image-overlay/resize-controller';

/**
 * Regression tests for the "zombie gesture" bug: when a gesture's pointerup is never delivered
 * (pointer capture broke mid-drag, e.g. the element turned display:none), the controllers used to
 * keep the gesture active forever — and since a mouse reuses the same pointerId, merely hovering
 * the element afterwards kept resizing/dragging the overlay in abrupt jumps.
 */

const MOUSE_POINTER_ID = 1;
const PRIMARY_BUTTON = 0;
const PRIMARY_BUTTONS_PRESSED = 1;
const NO_BUTTONS_PRESSED = 0;
const NATURAL_SIZE_PX = 100;

/** happy-dom lacks a PointerEvent constructor; a plain Event with assigned fields is equivalent. */
function firePointer(element: HTMLElement, type: string, props: Record<string, unknown>): void {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, props);
  element.dispatchEvent(event);
}

function createResizeHarness() {
  const handle = document.createElement('div');
  document.body.appendChild(handle);

  const onPreview = vi.fn();
  const onCommit = vi.fn();

  const controller = new ResizeController(
    { onPreview, onCommit },
    () => ({ offsetX: 0, offsetY: 0, scale: 1 }),
    () => ({ width: NATURAL_SIZE_PX, height: NATURAL_SIZE_PX }),
    () => ({ x: 0, y: 0 }),
  );

  controller.addHandle(handle, 'se');

  return { handle, onCommit, onPreview };
}

describe('ResizeController zombie gesture guard', () => {
  it('ends the gesture on the first buttons-free move instead of resizing on hover', () => {
    // Arrange: a started gesture whose pointerup is never delivered.
    const { handle, onCommit } = createResizeHarness();

    firePointer(handle, 'pointerdown', {
      pointerId: MOUSE_POINTER_ID,
      button: PRIMARY_BUTTON,
      buttons: PRIMARY_BUTTONS_PRESSED,
      clientX: NATURAL_SIZE_PX,
      clientY: NATURAL_SIZE_PX,
    });
    firePointer(handle, 'pointermove', {
      pointerId: MOUSE_POINTER_ID,
      buttons: PRIMARY_BUTTONS_PRESSED,
      clientX: NATURAL_SIZE_PX * 2,
      clientY: NATURAL_SIZE_PX * 2,
    });

    // Act: the next moves arrive with no pressed buttons (plain hover).
    firePointer(handle, 'pointermove', {
      pointerId: MOUSE_POINTER_ID,
      buttons: NO_BUTTONS_PRESSED,
      clientX: 500,
      clientY: 500,
    });
    firePointer(handle, 'pointermove', {
      pointerId: MOUSE_POINTER_ID,
      buttons: NO_BUTTONS_PRESSED,
      clientX: 900,
      clientY: 900,
    });

    // Assert: exactly one commit, with the transform from the LAST pressed move — the hover
    // positions never fed the resize math.
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({ scale: 2, offsetX: 0, offsetY: 0 });
  });

  it('ends the gesture when pointer capture is lost (element hidden mid-drag)', () => {
    // Arrange.
    const { handle, onCommit } = createResizeHarness();

    firePointer(handle, 'pointerdown', {
      pointerId: MOUSE_POINTER_ID,
      button: PRIMARY_BUTTON,
      buttons: PRIMARY_BUTTONS_PRESSED,
      clientX: NATURAL_SIZE_PX,
      clientY: NATURAL_SIZE_PX,
    });

    // Act: the browser revokes capture (e.g. the handle turned display:none).
    firePointer(handle, 'lostpointercapture', { pointerId: MOUSE_POINTER_ID });

    firePointer(handle, 'pointermove', {
      pointerId: MOUSE_POINTER_ID,
      buttons: NO_BUTTONS_PRESSED,
      clientX: 700,
      clientY: 700,
    });

    // Assert: the gesture ended at capture loss; the hover move changed nothing afterwards.
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
});

describe('DragController zombie gesture guard', () => {
  it('ends the gesture on the first buttons-free move instead of dragging on hover', () => {
    // Arrange.
    const element = document.createElement('div');
    document.body.appendChild(element);

    const onCommit = vi.fn();
    const controller = new DragController(element, { onPreview: vi.fn(), onCommit }, () => ({
      offsetX: 0,
      offsetY: 0,
    }));

    controller.attach();

    firePointer(element, 'pointerdown', {
      pointerId: MOUSE_POINTER_ID,
      button: PRIMARY_BUTTON,
      buttons: PRIMARY_BUTTONS_PRESSED,
      clientX: 0,
      clientY: 0,
    });
    firePointer(element, 'pointermove', {
      pointerId: MOUSE_POINTER_ID,
      buttons: PRIMARY_BUTTONS_PRESSED,
      clientX: 50,
      clientY: 60,
    });

    // Act: hover moves with no pressed buttons.
    firePointer(element, 'pointermove', {
      pointerId: MOUSE_POINTER_ID,
      buttons: NO_BUTTONS_PRESSED,
      clientX: 800,
      clientY: 800,
    });
    firePointer(element, 'pointermove', {
      pointerId: MOUSE_POINTER_ID,
      buttons: NO_BUTTONS_PRESSED,
      clientX: 900,
      clientY: 900,
    });

    // Assert: one commit at the last pressed position; hover never moved the overlay.
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith(50, 60);
  });
});
