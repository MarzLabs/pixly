import type { ToolId } from '@shared/constants';

/** Persistence granularity for a tool's state. See spec §5. */
export type ToolScope = 'origin' | 'url';

/** Result of any fallible operation; lets TypeScript narrow both branches. */
export type Result<T, E = string> = { ok: true; data: T } | { ok: false; error: E };

/** Supported blend modes for the image overlay (spec §7.3). */
export const BLEND_MODES = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'difference',
  'exclusion',
  'darken',
  'lighten',
] as const;

export type BlendMode = (typeof BLEND_MODES)[number];

/** Persisted state of the Image Overlay tool (light config; the binary lives in IndexedDB). */
export interface OverlayState {
  /** Key into the IndexedDB image store; null while no image is loaded. */
  imageKey: string | null;
  /** 0..1 opacity. */
  opacity: number;
  blendMode: BlendMode;
  /** Viewport-relative offset in CSS pixels. */
  offsetX: number;
  offsetY: number;
  /** Multiplicative scale factor (1 = natural). */
  scale: number;
  /** Locked overlays do not intercept the pointer. */
  locked: boolean;
  /** Hidden overlays keep their config but are not painted. */
  hidden: boolean;
  /** When true the overlay is pinned to the viewport; otherwise it scrolls with the page. */
  pinnedToViewport: boolean;
}

/** Persisted state of the Fix Broken Images tool. */
export interface FixBrokenImagesState {
  /** Images smaller than this on either axis are ignored (tracking pixels, spacers). */
  minSizePx: number;
}

/** Coloring strategies for the Global Outlines tool. */
export const OUTLINE_COLOR_MODES = ['by-depth', 'single'] as const;

export type OutlineColorMode = (typeof OUTLINE_COLOR_MODES)[number];

/** Persisted state of the Global Outlines tool. */
export interface GlobalOutlinesState {
  /** Outline thickness in CSS pixels. */
  widthPx: number;
  /** 'by-depth' cycles a palette per nesting level; 'single' uses one fixed color. */
  colorMode: OutlineColorMode;
}

/** Persisted state of the Grid Overlay tool (a Figma-style layout grid over the page). */
export interface GridOverlayState {
  /** Number of columns in the grid. */
  columns: number;
  /** Gap between columns, CSS pixels. */
  gutterPx: number;
  /** Horizontal padding between the grid frame and the viewport edges, CSS pixels. */
  marginPx: number;
  /** Frame max-width in CSS pixels; 0 means fluid (full viewport width). */
  maxWidthPx: number;
  /** 0..1 opacity of the whole grid. */
  opacity: number;
  /** Grid color as a #rrggbb hex string. */
  color: string;
  /** Whether the horizontal baseline grid is painted. */
  showBaseline: boolean;
  /** Baseline row height, CSS pixels. */
  baselinePx: number;
  /** Hidden grids keep their config but are not painted. */
  hidden: boolean;
}

/** Orientation of a guide line: vertical guides mark an x position, horizontal ones a y. */
export type GuideAxis = 'vertical' | 'horizontal';

/** A single draggable guide line, positioned in document coordinates (scrolls with the page). */
export interface GuideLine {
  axis: GuideAxis;
  positionPx: number;
}

/** Persisted state of the Rulers & Guides tool. */
export interface RulersGuidesState {
  /** Whether the edge rulers are painted; guides stay visible regardless. */
  rulersVisible: boolean;
  guides: GuideLine[];
}

/** Discriminated map from tool id to its state shape. */
export interface ToolStateMap {
  'fix-broken-images': FixBrokenImagesState;
  'image-overlay': OverlayState;
  'global-outlines': GlobalOutlinesState;
  'grid-overlay': GridOverlayState;
  'rulers-guides': RulersGuidesState;
}

/** Per-scope-key record of which tools are active and their serialized state. */
export interface ScopeRecord {
  activeToolIds: ToolId[];
  /** Serialized state per tool id. Partial because a tool may be active with default state. */
  states: Partial<{ [K in keyof ToolStateMap]: ToolStateMap[K] }>;
}

/** Top-left viewport position of the in-page toolbar widget, in CSS pixels. */
export interface WidgetPosition {
  x: number;
  y: number;
}

/**
 * Persisted UI state of the in-page toolbar, keyed by origin. Independent from tool state: it
 * describes where the pill/panel sits and whether the panel is expanded, not what any tool does.
 */
export interface ToolbarUiState {
  /** Null means the default docking corner (top-right); set once the user drags the widget. */
  position: WidgetPosition | null;
  /** The widget starts life as a minimized pill; expansion is an explicit user choice. */
  expanded: boolean;
}

/** Root persisted document. Keyed first by scope key, with a global enable flag. */
export interface PixlyConfig {
  globalEnabled: boolean;
  scopes: Record<string, ScopeRecord>;
  /** Toolbar UI state per origin. Optional so configs stored before this field keep loading. */
  toolbarUi?: Record<string, ToolbarUiState>;
}
