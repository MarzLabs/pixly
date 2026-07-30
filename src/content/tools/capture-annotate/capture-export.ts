import { DESIGN_TOKENS } from '@shared/constants/design-tokens';
import type { Annotation } from './annotation-tools/annotation-tool';
import { getAnnotationTool } from './annotation-tools';

/**
 * Composes the exported PNG for the Capture & Annotate tool: a provenance banner (page title,
 * URL, capture time) stacked above the screenshot with every annotation painted on top. The
 * banner is part of the bitmap on purpose — wherever the image travels, its origin travels with
 * it (spec: capture_annotate_tool §3).
 */

/** Provenance embedded into the exported image. */
export interface CaptureProvenance {
  /** Page title at capture time; the URL stands in when a page has no title. */
  title: string;
  url: string;
  /** Pre-formatted local capture time (see formatCapturedAt). */
  capturedAt: string;
}

/** Banner metrics in CSS pixels; the layout scales them by the capture's devicePixelRatio. */
const BANNER_HEIGHT_CSS_PX = 56;
const BANNER_PADDING_CSS_PX = 14;
const TITLE_FONT_CSS_PX = 14;
const DETAIL_FONT_CSS_PX = 11;
const ACCENT_RULE_CSS_PX = 2;

/** Vertical centers of the banner's two text lines, as fractions of the banner height. */
const TITLE_LINE_CENTER = 0.36;
const DETAIL_LINE_CENTER = 0.72;

/** All sizes in DEVICE pixels, derived from the screenshot's own scale. */
export interface ExportLayout {
  canvasWidth: number;
  canvasHeight: number;
  bannerHeightPx: number;
  paddingPx: number;
  titleFontPx: number;
  detailFontPx: number;
  accentRulePx: number;
}

/**
 * Export canvas layout for a screenshot of `imageWidth`×`imageHeight` device pixels captured at
 * `dpr`. Banner metrics scale with dpr so the header text matches the screenshot's density
 * instead of coming out tiny on retina captures.
 */
export function computeExportLayout(
  imageWidth: number,
  imageHeight: number,
  dpr: number,
): ExportLayout {
  const scale = Math.max(1, dpr);
  const bannerHeightPx = Math.round(BANNER_HEIGHT_CSS_PX * scale);

  return {
    canvasWidth: imageWidth,
    canvasHeight: imageHeight + bannerHeightPx,
    bannerHeightPx,
    paddingPx: Math.round(BANNER_PADDING_CSS_PX * scale),
    titleFontPx: Math.round(TITLE_FONT_CSS_PX * scale),
    detailFontPx: Math.round(DETAIL_FONT_CSS_PX * scale),
    accentRulePx: Math.round(ACCENT_RULE_CSS_PX * scale),
  };
}

/**
 * Cuts `text` with a trailing ellipsis until it fits `maxWidth` under the context's current
 * font. Exported for tests, which drive it with a stubbed measureText.
 */
export function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (maxWidth <= 0) {
    return '';
  }

  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }

  const ellipsis = '…';
  let length = text.length;

  while (length > 0) {
    length -= 1;
    const candidate = text.slice(0, length).trimEnd() + ellipsis;

    if (ctx.measureText(candidate).width <= maxWidth) {
      return candidate;
    }
  }

  return ellipsis;
}

/**
 * Renders banner + screenshot + annotations into a fresh canvas and returns it as a PNG blob.
 * Annotations are stored in CSS pixels, so they are replayed under a dpr transform offset below
 * the banner — the exact same renderers the editor uses paint the export.
 */
export function composeAnnotatedCapture(options: {
  image: ImageBitmap;
  dpr: number;
  annotations: readonly Annotation[];
  provenance: CaptureProvenance;
}): Promise<Blob> {
  const { image, dpr, annotations, provenance } = options;
  const layout = computeExportLayout(image.width, image.height, dpr);

  const canvas = document.createElement('canvas');
  canvas.width = layout.canvasWidth;
  canvas.height = layout.canvasHeight;

  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return Promise.reject(new Error('Canvas 2D context unavailable'));
  }

  drawBanner(ctx, layout, provenance);
  ctx.drawImage(image, 0, layout.bannerHeightPx);

  ctx.save();
  ctx.translate(0, layout.bannerHeightPx);
  ctx.scale(dpr, dpr);

  for (const annotation of annotations) {
    getAnnotationTool(annotation.toolId)?.render(ctx, annotation);
  }

  ctx.restore();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('PNG encoding failed'))),
      'image/png',
    );
  });
}

function drawBanner(
  ctx: CanvasRenderingContext2D,
  layout: ExportLayout,
  provenance: CaptureProvenance,
): void {
  ctx.fillStyle = DESIGN_TOKENS.colorSurface;
  ctx.fillRect(0, 0, layout.canvasWidth, layout.bannerHeightPx);

  // Brand-colored rule where the banner meets the screenshot, so the header reads as a frame.
  ctx.fillStyle = DESIGN_TOKENS.colorBrand;
  ctx.fillRect(
    0,
    layout.bannerHeightPx - layout.accentRulePx,
    layout.canvasWidth,
    layout.accentRulePx,
  );

  const maxTextWidth = layout.canvasWidth - layout.paddingPx * 2;
  ctx.textBaseline = 'middle';

  ctx.font = `600 ${layout.titleFontPx}px ${DESIGN_TOKENS.fontFamily}`;
  ctx.fillStyle = DESIGN_TOKENS.colorText;
  ctx.fillText(
    truncateToWidth(ctx, provenance.title || provenance.url, maxTextWidth),
    layout.paddingPx,
    layout.bannerHeightPx * TITLE_LINE_CENTER,
  );

  const detail = provenance.capturedAt
    ? `${provenance.url}  ·  ${provenance.capturedAt}`
    : provenance.url;

  ctx.font = `400 ${layout.detailFontPx}px ${DESIGN_TOKENS.fontFamily}`;
  ctx.fillStyle = DESIGN_TOKENS.colorTextMuted;
  ctx.fillText(
    truncateToWidth(ctx, detail, maxTextWidth),
    layout.paddingPx,
    layout.bannerHeightPx * DETAIL_LINE_CENTER,
  );
}
