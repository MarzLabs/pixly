import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { Tool } from '@content/core/tool';
import type { ToolbarUiState, WidgetPosition } from '@shared/types';
import {
  clampToViewport,
  IDLE_FADE_DELAY_MS,
  isDragGesture,
  WIDGET_MARGIN_PX,
} from './toolbar-geometry';

/**
 * In-page toolbar widget (spec §8, RF-UI-3). Collapsed it is a small draggable pill docked to a
 * corner; expanded it shows the live controls of ONE active tool at a time, picked from an icon
 * rail, so the footprint stays constant as more tools ship (RF-CORE-1).
 *
 * Position and expansion are persisted per origin by the orchestrator (via onUiStateChange); the
 * widget also fades while idle so it never competes with the pixels the user is comparing.
 *
 * This is Pixly's OWN UI, so Preact is appropriate here; it lives entirely inside the Shadow DOM.
 * Dragging uses Pointer Events + setPointerCapture (same rule as the overlay, RF-OVL-1).
 */

interface ToolbarProps {
  /** Active tools that expose live controls, in registry order. */
  activeTools: Tool[];
  /** Monotonic counter bumped by tools to force a controls re-render. */
  refreshNonce: number;
  /** Persisted position + expansion for the current origin. */
  uiState: ToolbarUiState;
  /** Commits a new UI state (drag end, expand/collapse) so the orchestrator persists it. */
  onUiStateChange: (state: ToolbarUiState) => void;
}

// Header controls (e.g. the collapse button) must not start a drag: capturing the pointer there
// would retarget the click to the header and the button's onClick would never fire.
const INTERACTIVE_SELECTOR = 'button, input, select, textarea, a';

const PILL_ICON = (
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
  >
    <rect x="3" y="3" width="13" height="13" rx="2" />
    <rect x="8" y="8" width="13" height="13" rx="2" />
  </svg>
);

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  baseX: number;
  baseY: number;
  width: number;
  height: number;
  moved: boolean;
}

export function Toolbar({ activeTools, refreshNonce, uiState, onUiStateChange }: ToolbarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<DragState | null>(null);
  const lastDragPosition = useRef<WidgetPosition | null>(null);
  const suppressClick = useRef(false);
  const [faded, setFaded] = useState(false);
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);

  // Handlers live on the root for the widget's whole life; refs keep them reading fresh props.
  const uiStateRef = useRef(uiState);
  uiStateRef.current = uiState;
  const onUiStateChangeRef = useRef(onUiStateChange);
  onUiStateChangeRef.current = onUiStateChange;

  const selectedTool = activeTools.find((tool) => tool.id === selectedToolId) ?? activeTools[0];

  // Drag either the pill (whole surface) or the panel (header only) using pointer capture, so the
  // gesture never sticks to the cursor. A press that never exceeds the threshold stays a click.
  useEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) {
        return;
      }

      // A fresh press never inherits suppression from a drag whose click was never dispatched
      // (e.g. released outside the widget).
      suppressClick.current = false;

      const target = event.target as Element | null;

      if (uiStateRef.current.expanded) {
        const header = headerRef.current;

        if (
          !header ||
          !target ||
          !header.contains(target) ||
          target.closest(INTERACTIVE_SELECTOR)
        ) {
          return;
        }
      }

      const rect = root.getBoundingClientRect();

      dragState.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        baseX: rect.left,
        baseY: rect.top,
        width: rect.width,
        height: rect.height,
        moved: false,
      };

      try {
        root.setPointerCapture(event.pointerId);
      } catch {
        // Capture unavailable — drag still works while the pointer stays on the widget.
      }

      event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent): void => {
      const drag = dragState.current;

      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - drag.startX;
      const deltaY = event.clientY - drag.startY;

      if (!drag.moved && !isDragGesture(deltaX, deltaY)) {
        return;
      }

      drag.moved = true;

      const position = clampToViewport(
        { x: drag.baseX + deltaX, y: drag.baseY + deltaY },
        drag.width,
        drag.height,
        window.innerWidth,
        window.innerHeight,
      );

      lastDragPosition.current = position;
      applyPositionStyle(root, position);
    };

    /** Releases capture and closes the gesture, returning it so the caller decides the outcome. */
    const finishGesture = (event: PointerEvent): DragState | null => {
      const drag = dragState.current;

      if (!drag || drag.pointerId !== event.pointerId) {
        return null;
      }

      try {
        root.releasePointerCapture(event.pointerId);
      } catch {
        // Already released.
      }

      dragState.current = null;

      return drag;
    };

    const onPointerUp = (event: PointerEvent): void => {
      const drag = finishGesture(event);

      if (!drag) {
        return;
      }

      if (drag.moved && lastDragPosition.current) {
        // Suppress the click that follows this pointerup, so a pill drag never also expands it.
        suppressClick.current = true;
        onUiStateChangeRef.current({ ...uiStateRef.current, position: lastDragPosition.current });

        return;
      }

      // Pointer capture retargets the tap's click event to this root, so the pill button's own
      // onClick never fires for pointer input; a press without movement on the pill IS the expand
      // click, handled here. The button's onClick still covers keyboard activation (Enter/Space).
      if (!uiStateRef.current.expanded) {
        onUiStateChangeRef.current({ ...uiStateRef.current, expanded: true });
      }
    };

    // A canceled gesture (e.g. touch scroll takeover) must never count as an expand tap; it only
    // commits the position it already reached, keeping the persisted state in sync with the visual.
    const onPointerCancel = (event: PointerEvent): void => {
      const drag = finishGesture(event);

      if (drag?.moved && lastDragPosition.current) {
        onUiStateChangeRef.current({ ...uiStateRef.current, position: lastDragPosition.current });
      }
    };

    // Consumed in capture phase right after a drag's pointerup, so the flag can never linger and
    // swallow a later, unrelated click on the pill or the collapse button.
    const onClickCapture = (event: MouseEvent): void => {
      if (suppressClick.current) {
        suppressClick.current = false;
        event.stopPropagation();
        event.preventDefault();
      }
    };

    root.addEventListener('pointerdown', onPointerDown);
    root.addEventListener('pointermove', onPointerMove);
    root.addEventListener('pointerup', onPointerUp);
    root.addEventListener('pointercancel', onPointerCancel);
    root.addEventListener('click', onClickCapture, true);

    return () => {
      root.removeEventListener('pointerdown', onPointerDown);
      root.removeEventListener('pointermove', onPointerMove);
      root.removeEventListener('pointerup', onPointerUp);
      root.removeEventListener('pointercancel', onPointerCancel);
      root.removeEventListener('click', onClickCapture, true);
    };
  }, []);

  // Idle fade: after a quiet period the widget turns translucent so it stops covering the page;
  // any hover or keyboard focus restores it instantly (opacity does not affect hit-testing).
  useEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    let fadeTimer: number | null = null;

    const scheduleFade = (): void => {
      if (fadeTimer !== null) {
        clearTimeout(fadeTimer);
      }

      fadeTimer = window.setTimeout(() => setFaded(true), IDLE_FADE_DELAY_MS);
    };

    const wake = (): void => {
      if (fadeTimer !== null) {
        clearTimeout(fadeTimer);
        fadeTimer = null;
      }

      setFaded(false);
    };

    root.addEventListener('pointerenter', wake);
    root.addEventListener('pointerleave', scheduleFade);
    root.addEventListener('focusin', wake);
    root.addEventListener('focusout', scheduleFade);

    scheduleFade();

    return () => {
      if (fadeTimer !== null) {
        clearTimeout(fadeTimer);
      }

      root.removeEventListener('pointerenter', wake);
      root.removeEventListener('pointerleave', scheduleFade);
      root.removeEventListener('focusin', wake);
      root.removeEventListener('focusout', scheduleFade);
    };
  }, []);

  // Re-clamp whenever the persisted position or the widget's size class changes (pill ↔ panel can
  // overflow the right/bottom edges when expanding), and when the window shrinks.
  useLayoutEffect(() => {
    const root = rootRef.current;

    if (!root) {
      return;
    }

    const reclamp = (): void => {
      if (!uiStateRef.current.position || dragState.current) {
        return;
      }

      const rect = root.getBoundingClientRect();
      const clamped = clampToViewport(
        { x: rect.left, y: rect.top },
        rect.width,
        rect.height,
        window.innerWidth,
        window.innerHeight,
      );

      if (clamped.x !== rect.left || clamped.y !== rect.top) {
        applyPositionStyle(root, clamped);
      }
    };

    reclamp();
    window.addEventListener('resize', reclamp);

    return () => window.removeEventListener('resize', reclamp);
  }, [uiState.position, uiState.expanded, activeTools.length]);

  const handlePillClick = (): void => {
    onUiStateChange({ ...uiState, expanded: true });
  };

  const handleCollapseClick = (): void => {
    onUiStateChange({ ...uiState, expanded: false });
  };

  const positionStyle = uiState.position
    ? { top: `${uiState.position.y}px`, left: `${uiState.position.x}px`, right: 'auto' }
    : { top: `${WIDGET_MARGIN_PX}px`, right: `${WIDGET_MARGIN_PX}px` };

  if (!selectedTool) {
    return null;
  }

  return (
    <div
      ref={rootRef}
      class={`pixly-widget${faded ? ' pixly-widget--faded' : ''}`}
      style={positionStyle}
    >
      {!uiState.expanded && (
        <button
          class="pixly-pill"
          title="Pixly — open the toolbar (drag to move)"
          aria-label="Open the Pixly toolbar"
          onClick={handlePillClick}
        >
          {PILL_ICON}
        </button>
      )}

      {uiState.expanded && (
        <div class="pixly-toolbar">
          <div ref={headerRef} class="pixly-toolbar__header">
            <span class="pixly-toolbar__title">Pixly</span>
            <button
              class="pixly-iconbtn"
              title="Minimize to pill"
              aria-label="Minimize the Pixly toolbar to a pill"
              onClick={handleCollapseClick}
            >
              –
            </button>
          </div>

          {activeTools.length > 1 && (
            <div class="pixly-toolbar__tabs" role="tablist">
              {activeTools.map((tool) => (
                <button
                  key={tool.id}
                  role="tab"
                  aria-selected={tool.id === selectedTool.id}
                  class={`pixly-tab${tool.id === selectedTool.id ? ' pixly-tab--active' : ''}`}
                  title={tool.name}
                  onClick={() => setSelectedToolId(tool.id)}
                  dangerouslySetInnerHTML={{ __html: tool.icon }}
                />
              ))}
            </div>
          )}

          <div class="pixly-toolbar__body" data-refresh={refreshNonce}>
            <section key={selectedTool.id} class="pixly-toolbar__section">
              <h3 class="pixly-toolbar__section-title">{selectedTool.name}</h3>
              {selectedTool.renderControls?.()}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

/** Switches the widget from the default right-docked anchor to explicit left/top coordinates. */
function applyPositionStyle(root: HTMLElement, position: WidgetPosition): void {
  root.style.right = 'auto';
  root.style.left = `${position.x}px`;
  root.style.top = `${position.y}px`;
}
