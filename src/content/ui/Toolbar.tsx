import { useEffect, useRef, useState } from 'preact/hooks';
import type { Tool } from '@content/core/tool';

/**
 * In-page floating toolbar (spec §8, RF-UI-3). Renders live controls for every active tool, pulled
 * straight from the registry so new tools appear with zero toolbar changes (RF-CORE-1).
 *
 * This is Pixly's OWN UI, so Preact is appropriate here; it lives entirely inside the Shadow DOM.
 * The header drag uses Pointer Events + setPointerCapture (same rule as the overlay, RF-OVL-1).
 */

interface ToolbarProps {
  /** Active tools whose controls should be shown, in registry order. */
  activeTools: Tool[];
  /** Monotonic counter bumped by tools to force a controls re-render. */
  refreshNonce: number;
}

const INITIAL_TOP_PX = 16;
const INITIAL_RIGHT_PX = 16;

export function Toolbar({ activeTools, refreshNonce }: ToolbarProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  const dragState = useRef<{ pointerId: number; startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );
  const position = useRef<{ x: number; y: number } | null>(null);

  // Drag the toolbar by its header using pointer capture so the gesture never sticks to the cursor.
  useEffect(() => {
    const header = headerRef.current;
    const root = rootRef.current;

    if (!header || !root) {
      return;
    }

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) {
        return;
      }

      const rect = root.getBoundingClientRect();
      position.current = position.current ?? { x: rect.left, y: rect.top };

      dragState.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        baseX: position.current.x,
        baseY: position.current.y,
      };

      try {
        header.setPointerCapture(event.pointerId);
      } catch {
        // Capture unavailable — drag still works while the pointer stays on the header.
      }

      event.preventDefault();
    };

    const onPointerMove = (event: PointerEvent): void => {
      const drag = dragState.current;

      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      const x = drag.baseX + (event.clientX - drag.startX);
      const y = drag.baseY + (event.clientY - drag.startY);
      position.current = { x, y };

      // Switch from right-anchored to left/top absolute positioning once dragged.
      root.style.right = 'auto';
      root.style.left = `${x}px`;
      root.style.top = `${y}px`;
    };

    const onPointerUp = (event: PointerEvent): void => {
      const drag = dragState.current;

      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      try {
        header.releasePointerCapture(event.pointerId);
      } catch {
        // Already released.
      }

      dragState.current = null;
    };

    header.addEventListener('pointerdown', onPointerDown);
    header.addEventListener('pointermove', onPointerMove);
    header.addEventListener('pointerup', onPointerUp);
    header.addEventListener('pointercancel', onPointerUp);

    return () => {
      header.removeEventListener('pointerdown', onPointerDown);
      header.removeEventListener('pointermove', onPointerMove);
      header.removeEventListener('pointerup', onPointerUp);
      header.removeEventListener('pointercancel', onPointerUp);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      class="pixly-toolbar"
      style={{ top: `${INITIAL_TOP_PX}px`, right: `${INITIAL_RIGHT_PX}px` }}
    >
      <div ref={headerRef} class="pixly-toolbar__header">
        <span class="pixly-toolbar__title">Pixly</span>
        <button
          class="pixly-iconbtn"
          title={collapsed ? 'Expand' : 'Collapse'}
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? '+' : '–'}
        </button>
      </div>

      {!collapsed && (
        <div class="pixly-toolbar__body" data-refresh={refreshNonce}>
          {activeTools.map((tool) => (
            <section key={tool.id} class="pixly-toolbar__section">
              <h3 class="pixly-toolbar__section-title">{tool.name}</h3>
              {tool.renderControls()}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
