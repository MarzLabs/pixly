import { TOOL_ID, type ToolId } from '@shared/constants';
import type { ToolScope } from '@shared/types';

/**
 * Static tool metadata for UI that does not have a live ToolContext (the popup). Kept in sync with
 * the actual Tool implementations; the content script remains the source of truth for behavior, but
 * the popup only needs name/description/scope to render its list (RF-UI-2).
 *
 * Adding a future tool means adding one entry here and one register() call — no other UI edits.
 */

/**
 * Declarative description of a set-and-forget configuration field, rendered by the popup and
 * persisted into the tool's state. Live controls (adjusted while watching the page) stay in the
 * in-page toolbar instead; this split keeps the on-page widget minimal.
 */
export interface ToolConfigField {
  /** Key inside the tool's persisted state object. */
  key: string;
  label: string;
  kind: 'number';
  min?: number;
  /** Short explanation rendered under the input. */
  hint?: string;
}

export interface ToolCatalogEntry {
  id: ToolId;
  name: string;
  description: string;
  scope: ToolScope;
  icon: string;
  /** Infrequent configuration edited from the popup while the tool is enabled. */
  configFields?: ToolConfigField[];
}

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    id: TOOL_ID.fixBrokenImages,
    name: 'Fix Broken Images',
    description: 'Replace broken images with same-size placeholders so the layout stays intact.',
    scope: 'origin',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
    configFields: [
      {
        key: 'minSizePx',
        label: 'Minimum size (px)',
        kind: 'number',
        min: 1,
        hint: 'Images smaller than this on either side are ignored (tracking pixels, spacers).',
      },
    ],
  },
  {
    id: TOOL_ID.imageOverlay,
    name: 'Image Overlay',
    description: 'Overlay a design export to compare it pixel-by-pixel with the page.',
    scope: 'url',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="13" height="13" rx="2"/><rect x="8" y="8" width="13" height="13" rx="2"/></svg>',
  },
];
