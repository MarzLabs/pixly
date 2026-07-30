import { describe, expect, it } from 'vitest';
import type { Annotation } from '@content/tools/capture-annotate/annotation-tools/annotation-tool';
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
