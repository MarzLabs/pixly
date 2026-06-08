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
}

/** Persisted state of the Fix Broken Images tool. */
export interface FixBrokenImagesState {
  /** Images smaller than this on either axis are ignored (tracking pixels, spacers). */
  minSizePx: number;
}

/** Discriminated map from tool id to its state shape. */
export interface ToolStateMap {
  'fix-broken-images': FixBrokenImagesState;
  'image-overlay': OverlayState;
}

/** Per-scope-key record of which tools are active and their serialized state. */
export interface ScopeRecord {
  activeToolIds: ToolId[];
  /** Serialized state per tool id. Partial because a tool may be active with default state. */
  states: Partial<{ [K in keyof ToolStateMap]: ToolStateMap[K] }>;
}

/** Root persisted document. Keyed first by scope key, with a global enable flag. */
export interface PixlyConfig {
  globalEnabled: boolean;
  scopes: Record<string, ScopeRecord>;
}
