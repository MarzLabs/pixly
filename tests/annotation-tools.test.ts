import { describe, expect, it } from 'vitest';
import type { Annotation } from '@content/tools/capture-annotate/annotation-tools/annotation-tool';
import { translateAnnotation } from '@content/tools/capture-annotate/annotation-tools/annotation-tool';
import {
  ANNOTATION_TOOLS,
  getAnnotationTool,
  isAnnotationToolId,
} from '@content/tools/capture-annotate/annotation-tools';
import {
  computeExportLayout,
  truncateToWidth,
} from '@content/tools/capture-annotate/capture-export';

/**
 * Recording stub standing in for a CanvasRenderingContext2D: happy-dom has no real 2D context,
 * and the renderers only need method calls + style properties to be observable.
 */
function createStubContext(): { ctx: CanvasRenderingContext2D; calls: string[] } {
  const calls: string[] = [];
  const record =
    (name: string) =>
    (..._args: unknown[]): void => {
      calls.push(name);
    };

  const stub = {
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    lineCap: '',
    lineJoin: '',
    font: '',
    textAlign: '',
    textBaseline: '',
    shadowColor: '',
    shadowBlur: 0,
    beginPath: record('beginPath'),
    moveTo: record('moveTo'),
    lineTo: record('lineTo'),
    rect: record('rect'),
    ellipse: record('ellipse'),
    stroke: record('stroke'),
    fillText: record('fillText'),
    save: record('save'),
    restore: record('restore'),
    /** Every character is 5px wide, so text hit boxes are predictable. */
    measureText: (text: string) => ({ width: text.length * 5 }),
  };

  return { ctx: stub as unknown as CanvasRenderingContext2D, calls };
}

function buildAnnotation(toolId: string, text?: string): Annotation {
  const annotation: Annotation = {
    toolId,
    start: { x: 10, y: 10 },
    end: { x: 90, y: 50 },
    style: { color: '#3B82F6', strokeWidthPx: 5 },
  };

  if (text !== undefined) {
    annotation.text = text;
  }

  return annotation;
}

describe('annotation tool registry', () => {
  it('registers at least arrow, line, rect, ellipse, text and emoji', () => {
    const ids = ANNOTATION_TOOLS.map((tool) => tool.id);

    expect(ids).toEqual(
      expect.arrayContaining(['arrow', 'line', 'rect', 'ellipse', 'text', 'emoji']),
    );
  });

  it('has unique ids and toolbar metadata for every tool', () => {
    const ids = ANNOTATION_TOOLS.map((tool) => tool.id);

    expect(new Set(ids).size).toBe(ids.length);

    for (const tool of ANNOTATION_TOOLS) {
      expect(tool.name.length).toBeGreaterThan(0);
      expect(tool.icon).toContain('<svg');
    }
  });

  it('resolves registered ids and rejects unknown ones', () => {
    for (const tool of ANNOTATION_TOOLS) {
      expect(getAnnotationTool(tool.id)).toBe(tool);
      expect(isAnnotationToolId(tool.id)).toBe(true);
    }

    expect(getAnnotationTool('laser-pointer')).toBeUndefined();
    expect(isAnnotationToolId('laser-pointer')).toBe(false);
  });

  it('every tool paints with the annotation style, not a hardcoded one', () => {
    for (const tool of ANNOTATION_TOOLS) {
      const { ctx, calls } = createStubContext();
      const annotation = buildAnnotation(tool.id, 'Aa');

      tool.render(ctx, annotation);

      if ((tool.interaction ?? 'drag') === 'drag') {
        expect(ctx.strokeStyle, tool.id).toBe('#3B82F6');
        expect(ctx.lineWidth, tool.id).toBe(5);
        expect(calls, tool.id).toContain('beginPath');
        expect(calls, tool.id).toContain('stroke');
      } else {
        expect(calls, tool.id).toContain('fillText');
      }
    }
  });

  it('stamp tools declare a non-empty glyph palette', () => {
    for (const tool of ANNOTATION_TOOLS) {
      if (tool.interaction === 'stamp') {
        expect(tool.glyphs?.length ?? 0, tool.id).toBeGreaterThan(0);
      }
    }
  });
});

describe('TextTool', () => {
  const textTool = ANNOTATION_TOOLS.find((tool) => tool.id === 'text');

  it('renders one line per explicit newline, in the annotation color', () => {
    const { ctx, calls } = createStubContext();

    textTool?.render(ctx, buildAnnotation('text', 'first\nsecond'));

    expect(calls.filter((call) => call === 'fillText')).toHaveLength(2);
    expect(ctx.fillStyle).toBe('#3B82F6');
    // save/restore isolate the shadow + font so the next annotation is unaffected.
    expect(calls).toContain('save');
    expect(calls).toContain('restore');
  });

  it('draws nothing for empty or missing text', () => {
    for (const text of [undefined, '', '   \n  ']) {
      const { ctx, calls } = createStubContext();

      textTool?.render(ctx, buildAnnotation('text', text));
      expect(calls, JSON.stringify(text)).not.toContain('fillText');
    }
  });
});

describe('EmojiTool', () => {
  const emojiTool = ANNOTATION_TOOLS.find((tool) => tool.id === 'emoji');

  it('stamps the glyph centered on the click point', () => {
    const { ctx, calls } = createStubContext();

    emojiTool?.render(ctx, buildAnnotation('emoji', '🔥'));

    expect(calls.filter((call) => call === 'fillText')).toHaveLength(1);
    expect(ctx.textAlign).toBe('center');
    expect(ctx.textBaseline).toBe('middle');
  });

  it('draws nothing without a glyph', () => {
    const { ctx, calls } = createStubContext();

    emojiTool?.render(ctx, buildAnnotation('emoji'));
    expect(calls).not.toContain('fillText');
  });
});

describe('translateAnnotation', () => {
  it('shifts both points and keeps style and text untouched', () => {
    const moved = translateAnnotation(buildAnnotation('text', 'hola'), 5, -3);

    expect(moved.start).toEqual({ x: 15, y: 7 });
    expect(moved.end).toEqual({ x: 95, y: 47 });
    expect(moved.style).toEqual({ color: '#3B82F6', strokeWidthPx: 5 });
    expect(moved.text).toBe('hola');
  });
});

describe('hitTest (move mode)', () => {
  const { ctx } = createStubContext();
  const hit = (toolId: string, x: number, y: number, text?: string): boolean => {
    const tool = ANNOTATION_TOOLS.find((candidate) => candidate.id === toolId);

    return tool?.hitTest?.(ctx, buildAnnotation(toolId, text), { x, y }) ?? false;
  };

  it('lines and arrows grab near the stroke, not across their bounding box', () => {
    // Annotation runs (10,10) → (90,50); its midpoint is (50,30).
    expect(hit('line', 50, 30)).toBe(true);
    expect(hit('arrow', 50, 30)).toBe(true);
    // Bounding-box corner far from the diagonal stroke.
    expect(hit('line', 88, 12)).toBe(false);
    expect(hit('arrow', 12, 48)).toBe(false);
  });

  it('rects grab anywhere inside their frame', () => {
    expect(hit('rect', 50, 30)).toBe(true);
    expect(hit('rect', 50, 70)).toBe(false);
  });

  it('ellipses grab inside the ellipse but not in the bounding-box corners', () => {
    expect(hit('ellipse', 50, 30)).toBe(true);
    expect(hit('ellipse', 12, 12)).toBe(false);
  });

  it('text grabs by its measured box and never without content', () => {
    // 'hello' at 5px/char under the stub → 25px wide from (10,10).
    expect(hit('text', 20, 20, 'hello')).toBe(true);
    expect(hit('text', 80, 20, 'hello')).toBe(false);
    expect(hit('text', 12, 12)).toBe(false);
  });

  it('emoji grabs by a square around the stamp center and never without a glyph', () => {
    expect(hit('emoji', 15, 15, '🔥')).toBe(true);
    expect(hit('emoji', 80, 45, '🔥')).toBe(false);
    expect(hit('emoji', 10, 10)).toBe(false);
  });
});

describe('bounds (selection outline)', () => {
  const { ctx } = createStubContext();
  const boundsOf = (toolId: string, text?: string) => {
    const tool = ANNOTATION_TOOLS.find((candidate) => candidate.id === toolId);

    return tool?.bounds?.(ctx, buildAnnotation(toolId, text)) ?? null;
  };

  it('text bounds anchor at the start point with measured width and line count height', () => {
    // 'hello' at 5px/char under the stub → 25px wide; 2 lines at stroke 5 → 2 × lineHeight.
    const box = boundsOf('text', 'hello\nhi');

    expect(box).not.toBeNull();
    expect(box?.left).toBe(10);
    expect(box?.top).toBe(10);
    expect(box?.width).toBe(25);
    expect(box?.height).toBeGreaterThan(0);
  });

  it('emoji bounds form a stamp-sized square centered on the click point', () => {
    const box = boundsOf('emoji', '🔥');

    expect(box).not.toBeNull();
    expect(box?.left).toBeLessThan(10);
    expect(box?.width).toBe(box?.height);
    // Centered: left + width/2 === start.x.
    expect((box?.left ?? 0) + (box?.width ?? 0) / 2).toBe(10);
  });

  it('returns null when there is nothing to outline', () => {
    expect(boundsOf('text')).toBeNull();
    expect(boundsOf('emoji')).toBeNull();
  });

  it('drag-shaped tools rely on grips instead of bounds', () => {
    for (const toolId of ['arrow', 'line', 'rect', 'ellipse']) {
      expect(boundsOf(toolId)).toBeNull();
    }
  });
});

describe('computeExportLayout', () => {
  it('stacks the banner above the image at 1x', () => {
    const layout = computeExportLayout(800, 600, 1);

    expect(layout.canvasWidth).toBe(800);
    expect(layout.canvasHeight).toBe(600 + layout.bannerHeightPx);
    expect(layout.bannerHeightPx).toBeGreaterThan(0);
  });

  it('scales banner metrics with the devicePixelRatio', () => {
    const at1x = computeExportLayout(800, 600, 1);
    const at2x = computeExportLayout(1600, 1200, 2);

    expect(at2x.bannerHeightPx).toBe(at1x.bannerHeightPx * 2);
    expect(at2x.titleFontPx).toBe(at1x.titleFontPx * 2);
  });

  it('treats sub-1 ratios as 1 so the banner never shrinks below its design size', () => {
    expect(computeExportLayout(800, 600, 0.5).bannerHeightPx).toBe(
      computeExportLayout(800, 600, 1).bannerHeightPx,
    );
  });
});

describe('truncateToWidth', () => {
  /** measureText stub: every character is 5px wide. */
  const ctx = {
    measureText: (text: string) => ({ width: text.length * 5 }),
  } as unknown as CanvasRenderingContext2D;

  it('returns text that already fits unchanged', () => {
    expect(truncateToWidth(ctx, 'hello', 100)).toBe('hello');
  });

  it('cuts overflowing text with a trailing ellipsis that fits the budget', () => {
    const result = truncateToWidth(ctx, 'a'.repeat(100), 50);

    expect(result.endsWith('…')).toBe(true);
    expect(result.length * 5).toBeLessThanOrEqual(50);
  });

  it('degrades to a bare ellipsis or nothing when there is no room', () => {
    expect(truncateToWidth(ctx, 'abcdef', 5)).toBe('…');
    expect(truncateToWidth(ctx, 'abcdef', 0)).toBe('');
  });
});
