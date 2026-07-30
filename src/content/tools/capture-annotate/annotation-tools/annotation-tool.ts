/**
 * The contract every annotation tool implements (spec: capture_annotate_tool §3). Mirrors the
 * top-level Tool/ToolRegistry pattern one level down: the capture editor builds its toolbar and
 * its rendering loop entirely from the registered specs, so adding a new shape is a single new
 * module plus one registry entry — no editor or exporter changes.
 */

/** A point in capture-image CSS pixel coordinates (origin at the screenshot's top-left). */
export interface AnnotationPoint {
  x: number;
  y: number;
}

/** Visual style of a single annotation, frozen at draw time so restyling never mutates history. */
export interface AnnotationStyle {
  /** Stroke color as a #rrggbb hex string. */
  color: string;
  /** Stroke width in CSS pixels. */
  strokeWidthPx: number;
}

/**
 * How the editor captures the gesture for a tool. The editor owns each lifecycle — tools only
 * declare which one they need, so new interaction kinds extend this union, not the tools.
 *
 * - 'drag': press → drag → release commits a start/end shape (the default).
 * - 'text': a click opens an inline input at the point; its committed value becomes `text`.
 * - 'stamp': a click commits immediately, with the tool's selected glyph as `text`.
 */
export type AnnotationInteraction = 'drag' | 'text' | 'stamp';

/**
 * One committed annotation. Every tool shares the same point geometry (start → end), which keeps
 * annotations serializable and lets the editor own the pointer lifecycle: tools only decide how
 * to PAINT the gesture, never how to capture it. Click-defined tools use start === end.
 */
export interface Annotation {
  /** Id of the annotation tool that owns the rendering of this annotation. */
  toolId: string;
  /** Where the drag started (anchor point). */
  start: AnnotationPoint;
  /** Where the drag ended (e.g. an arrow's tip, a rect's opposite corner). */
  end: AnnotationPoint;
  style: AnnotationStyle;
  /** Content for 'text' and 'stamp' tools; drag-shaped tools leave it unset. */
  text?: string;
}

/** A single annotation tool: static toolbar metadata plus its canvas renderer. */
export interface AnnotationToolSpec {
  /** Stable id, persisted as the user's last-used tool. */
  readonly id: string;
  /** User-facing name (English, matches the top-level tool naming convention). */
  readonly name: string;
  /** Inline SVG markup string for the editor toolbar button. */
  readonly icon: string;
  /** Gesture the editor should run for this tool; omitted means 'drag'. */
  readonly interaction?: AnnotationInteraction;
  /** For 'stamp' tools: glyph choices the editor offers as a secondary palette. */
  readonly glyphs?: readonly string[];
  /**
   * Paints the annotation onto a 2D context whose transform already maps CSS pixels to device
   * pixels. Called for committed annotations, live drag previews and the final export alike.
   */
  render(ctx: CanvasRenderingContext2D, annotation: Annotation): void;
}

/** Shared stroke setup so every tool draws with the same line quality. */
export function applyStrokeStyle(ctx: CanvasRenderingContext2D, style: AnnotationStyle): void {
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.strokeWidthPx;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}
