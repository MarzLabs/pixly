import { clamp } from '@shared/lib/math';
import type { WidgetPosition } from '@shared/types';

/**
 * Pure positioning helpers for the in-page toolbar widget (pill + panel). No DOM access, so the
 * clamping and gesture rules are unit-testable.
 */

/** Inset the widget keeps from the viewport edges; also the default docking offset. */
export const WIDGET_MARGIN_PX = 16;

/** Pointer travel (px) beyond which a press on the widget becomes a drag instead of a click. */
export const DRAG_ACTIVATION_THRESHOLD_PX = 4;

/** Fixed panel width. Mirrored by `.pixly-toolbar` in shadow-ui.css. */
export const PANEL_WIDTH_PX = 320;

/** Pill diameter. Mirrored by `.pixly-pill` in shadow-ui.css. */
export const PILL_SIZE_PX = 40;

/** Idle time without pointer/focus after which the widget fades to stay out of the way. */
export const IDLE_FADE_DELAY_MS = 2500;

/**
 * Keeps the widget's top-left corner inside the viewport, honoring the edge margin. When the
 * viewport is smaller than the widget the top-left corner wins, so the drag handle stays reachable.
 */
export function clampToViewport(
  position: WidgetPosition,
  widgetWidth: number,
  widgetHeight: number,
  viewportWidth: number,
  viewportHeight: number,
): WidgetPosition {
  const maxX = Math.max(WIDGET_MARGIN_PX, viewportWidth - widgetWidth - WIDGET_MARGIN_PX);
  const maxY = Math.max(WIDGET_MARGIN_PX, viewportHeight - widgetHeight - WIDGET_MARGIN_PX);

  return {
    x: clamp(position.x, WIDGET_MARGIN_PX, maxX),
    y: clamp(position.y, WIDGET_MARGIN_PX, maxY),
  };
}

/** True once pointer travel is large enough to count as a drag rather than a click. */
export function isDragGesture(deltaX: number, deltaY: number): boolean {
  return (
    Math.abs(deltaX) > DRAG_ACTIVATION_THRESHOLD_PX ||
    Math.abs(deltaY) > DRAG_ACTIVATION_THRESHOLD_PX
  );
}
