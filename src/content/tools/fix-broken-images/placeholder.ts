/**
 * Builds the SVG placeholder that replaces a broken image's `src` (spec §6.3). Pure: given the
 * rendered box and metadata it returns a deterministic SVG data-URI, so geometry and escaping are
 * unit-testable without touching the DOM.
 */

export interface PlaceholderInput {
  /** Rendered box of the original image in CSS pixels. */
  width: number;
  height: number;
  /** Original alt text, shown when there is room. */
  alt: string | null;
  /** Broken source URL, surfaced for the developer (truncated for very long URLs). */
  brokenSrc: string | null;
}

/** Minimum box (px) at which the dimension label is drawn; below this only the glyph shows. */
const MIN_SIZE_FOR_LABEL_PX = 48;
/** Minimum box (px) at which the alt/source text is drawn. */
const MIN_SIZE_FOR_TEXT_PX = 96;
/** Stripe pattern period in px, scaled down for tiny boxes. */
const STRIPE_PERIOD_PX = 12;
const PLACEHOLDER_BG = '#2b2b30';
const PLACEHOLDER_STRIPE = '#34343b';
const PLACEHOLDER_BORDER = '#52525b';
const PLACEHOLDER_GLYPH = '#71717a';
const PLACEHOLDER_TEXT = '#a1a1aa';

/** Escapes text for safe inclusion inside SVG markup (prevents broken/injected markup). */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Returns the human dimension label, e.g. "320 × 240". */
export function formatDimensions(width: number, height: number): string {
  return `${Math.round(width)} × ${Math.round(height)}`;
}

/** Builds the raw SVG markup (not yet data-URI-encoded). Exposed for assertions in tests. */
export function buildPlaceholderSvg(input: PlaceholderInput): string {
  const width = Math.max(1, Math.round(input.width));
  const height = Math.max(1, Math.round(input.height));

  const showLabel = width >= MIN_SIZE_FOR_LABEL_PX && height >= MIN_SIZE_FOR_LABEL_PX;
  const showText = width >= MIN_SIZE_FOR_TEXT_PX && height >= MIN_SIZE_FOR_TEXT_PX;

  const centerX = width / 2;
  const centerY = height / 2;

  const glyphSize = Math.min(width, height) * 0.3;
  const glyph = buildBrokenImageGlyph(centerX, centerY, glyphSize);

  const labels: string[] = [];

  if (showLabel) {
    const dimensionsY = showText ? centerY + glyphSize : centerY + glyphSize * 0.9;
    labels.push(
      `<text x="${centerX}" y="${dimensionsY}" fill="${PLACEHOLDER_TEXT}" font-family="monospace" font-size="12" text-anchor="middle">${escapeXml(formatDimensions(width, height))}</text>`,
    );
  }

  if (showText && input.alt) {
    const altY = centerY + glyphSize + 18;
    labels.push(
      `<text x="${centerX}" y="${altY}" fill="${PLACEHOLDER_TEXT}" font-family="sans-serif" font-size="11" text-anchor="middle">${escapeXml(truncate(input.alt, 40))}</text>`,
    );
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Broken image placeholder">
  <defs>
    <pattern id="pixlyStripes" width="${STRIPE_PERIOD_PX}" height="${STRIPE_PERIOD_PX}" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
      <rect width="${STRIPE_PERIOD_PX}" height="${STRIPE_PERIOD_PX}" fill="${PLACEHOLDER_BG}"/>
      <rect width="${STRIPE_PERIOD_PX / 2}" height="${STRIPE_PERIOD_PX}" fill="${PLACEHOLDER_STRIPE}"/>
    </pattern>
  </defs>
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="url(#pixlyStripes)" stroke="${PLACEHOLDER_BORDER}" stroke-width="1" stroke-dasharray="4 3"/>
  ${glyph}
  ${labels.join('\n  ')}
</svg>`;
}

/** Encodes the SVG as a UTF-8 data-URI suitable for an `<img src>`. */
export function buildPlaceholderDataUri(input: PlaceholderInput): string {
  const svg = buildPlaceholderSvg(input);

  // encodeURIComponent keeps the SVG valid across all browsers without base64 bloat.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildBrokenImageGlyph(centerX: number, centerY: number, size: number): string {
  const half = size / 2;
  const left = centerX - half;
  const top = centerY - half;

  // A simple framed "mountain + torn" mark evoking a broken image icon.
  return `<g stroke="${PLACEHOLDER_GLYPH}" stroke-width="${Math.max(1, size * 0.06)}" fill="none">
    <rect x="${left}" y="${top}" width="${size}" height="${size}" rx="${size * 0.1}"/>
    <circle cx="${left + size * 0.32}" cy="${top + size * 0.32}" r="${size * 0.08}"/>
    <path d="M${left} ${top + size * 0.75} L${left + size * 0.35} ${top + size * 0.45} L${left + size * 0.6} ${top + size * 0.7}"/>
    <path d="M${left + size * 0.55} ${top + size * 0.6} L${left + size * 0.75} ${top + size * 0.4} L${left + size} ${top + size * 0.7}"/>
  </g>`;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}
