import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnnotationEditor } from '@content/tools/capture-annotate/annotation-editor';

/**
 * Modal keyboard barrier tests: while the editor is open, key events must never reach the
 * page's own listeners (single-letter hotkeys on GitHub, Gmail, etc.), whether they target
 * the page or the editor's own controls — yet editor-internal targets must still receive
 * them, or typing in the text entry would break.
 */

function createEditor(): AnnotationEditor {
  const bitmap = { width: 800, height: 600, close: () => {} } as unknown as ImageBitmap;

  return new AnnotationEditor(
    document.body,
    {
      bitmap,
      dpr: 1,
      title: 'Fixture page',
      url: 'https://example.test/page',
      capturedAtIso: new Date(2026, 0, 1, 12, 0).toISOString(),
    },
    { toolId: 'arrow', color: '#EF4444', strokeWidthPx: 4 },
    { onStyleChange: () => {}, onClose: () => {} },
  );
}

function pressKey(target: EventTarget, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, composed: true }));
}

describe('annotation editor keyboard barrier', () => {
  let editor: AnnotationEditor | null = null;
  let pageKeydowns: string[];
  const pageListener = (event: Event): void => {
    pageKeydowns.push((event as KeyboardEvent).key);
  };

  beforeEach(() => {
    // happy-dom has no canvas implementation; the editor already guards a null 2D context.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    pageKeydowns = [];
    // Simulates a page-level hotkey handler (GitHub-style: document, bubble phase).
    document.addEventListener('keydown', pageListener);
  });

  afterEach(() => {
    editor?.destroy();
    editor = null;
    document.removeEventListener('keydown', pageListener);
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('blocks keys aimed at the page while the editor is open', () => {
    editor = createEditor();

    pressKey(document.body, 'g');
    expect(pageKeydowns).toEqual([]);
  });

  it('lets editor-internal targets receive keys but stops them at the editor boundary', () => {
    editor = createEditor();
    const button = document.body.querySelector<HTMLButtonElement>('.pixly-tab');
    expect(button).not.toBeNull();

    let buttonSaw = 0;
    button?.addEventListener('keydown', () => {
      buttonSaw += 1;
    });

    if (button) {
      pressKey(button, 'g');
    }

    // The internal target got the event (typing keeps working)…
    expect(buttonSaw).toBe(1);
    // …but the page's hotkey listener never did.
    expect(pageKeydowns).toEqual([]);
  });

  it('stops guarding once the editor is destroyed', () => {
    editor = createEditor();
    editor.destroy();
    editor = null;

    pressKey(document.body, 'g');
    expect(pageKeydowns).toEqual(['g']);
  });
});
