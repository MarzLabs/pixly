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
interface ToolConfigFieldBase {
  /** Key inside the tool's persisted state object. */
  key: string;
  label: string;
  /** Short explanation rendered under the input. */
  hint?: string;
}

export interface ToolConfigFieldNumber extends ToolConfigFieldBase {
  kind: 'number';
  min?: number;
}

export interface ToolConfigFieldSelect extends ToolConfigFieldBase {
  kind: 'select';
  options: ReadonlyArray<{ value: string; label: string }>;
}

export type ToolConfigField = ToolConfigFieldNumber | ToolConfigFieldSelect;

export interface ToolCatalogEntry {
  id: ToolId;
  name: string;
  description: string;
  /** Short "what is this for" note, expandable from the popup card for less obvious tools. */
  help?: string;
  scope: ToolScope;
  icon: string;
  /** Infrequent configuration edited from the popup while the tool is enabled. */
  configFields?: ToolConfigField[];
  /**
   * When true, enabling the tool from the popup requests the site's optional host permission
   * (chrome.permissions must be called from an extension context within a user gesture). Needed
   * by capabilities like captureVisibleTab, where activeTab alone lapses on every navigation.
   */
  needsHostPermission?: boolean;
}

export const TOOL_CATALOG: ToolCatalogEntry[] = [
  {
    id: TOOL_ID.fixBrokenImages,
    name: 'Fix Broken Images',
    description: 'Replace broken images with same-size placeholders so the layout stays intact.',
    help: 'Broken image icons distort a layout review. Each broken <img> gets a placeholder with its exact size and position, so you judge the real layout; turning the tool off restores everything.',
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
    help: 'Drop or paste a design export (e.g. a Figma PNG) over the page, then lower its opacity or switch to the difference blend to verify the implementation matches the design pixel by pixel.',
    scope: 'url',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="13" height="13" rx="2"/><rect x="8" y="8" width="13" height="13" rx="2"/></svg>',
  },
  {
    id: TOOL_ID.gridOverlay,
    name: 'Grid Overlay',
    description: 'Paint the layout grid (columns, gutters, baseline) over the page.',
    help: "Recreate your design's grid (like Figma layout grids) on the real page to check that sections and components actually align to the columns and baseline they were designed on.",
    scope: 'origin',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="4" height="18"/><rect x="10" y="3" width="4" height="18"/><rect x="17" y="3" width="4" height="18"/></svg>',
  },
  {
    id: TOOL_ID.rulersGuides,
    name: 'Rulers & Guides',
    description: 'Pixel rulers on the page edges with draggable, persistent guide lines.',
    help: 'Drag out of a ruler to drop a guide (top ruler → horizontal, left → vertical); drop it back on the ruler to delete it. Guides persist per page, so alignment checks are repeatable.',
    scope: 'url',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3h18v5H3z"/><path d="M3 3v18h5V3"/><path d="M7 8v-2M11 8v-2M15 8v-2M19 8v-2M8 7h-2M8 11h-2M8 15h-2M8 19h-2"/></svg>',
  },
  {
    id: TOOL_ID.distanceMeter,
    name: 'Distance Meter',
    description: 'Drag between two points to measure pixel distances on the page.',
    help: 'Measure exact gaps and offsets: drag from A to B to get width, height and distance in px. Endpoints snap to element edges, so spacing is measured border to border, not by eye.',
    scope: 'url',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20L20 4"/><circle cx="4" cy="20" r="2"/><circle cx="20" cy="4" r="2"/><path d="M9 15l1.5 1.5M13 11l1.5 1.5"/></svg>',
  },
  {
    id: TOOL_ID.snapshotCompare,
    name: 'Snapshot & Compare',
    description: 'Capture the page and compare it against its current state.',
    help: 'Capture the page BEFORE a change (CSS fix, deploy, experiment). Afterwards, the capture sits over the page in difference blend: identical pixels turn black, so anything that changed — intended or not — glows.',
    scope: 'url',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 8a2 2 0 012-2h2l2-2h6l2 2h2a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><circle cx="12" cy="13" r="4"/></svg>',
    needsHostPermission: true,
  },
  {
    id: TOOL_ID.captureAnnotate,
    name: 'Capture & Annotate',
    description: 'Capture the page and annotate it with arrows and shapes for sharing.',
    help: 'Capture the visible viewport and mark it up with arrows, lines, rectangles and ellipses in a full-screen editor, then download or copy the PNG. The export embeds the page title, URL and capture time in a header, so everyone knows exactly where the capture came from.',
    scope: 'origin',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M8 15l6-6"/><path d="M10 9h4v4"/></svg>',
    needsHostPermission: true,
  },
  {
    id: TOOL_ID.globalOutlines,
    name: 'Global Outlines',
    description: 'Outline every element on the page to reveal the real layout structure.',
    help: 'The classic layout X-ray: every element gets an outline (colored by nesting depth), exposing invisible boxes, unexpected wrappers and stray spacing without inspecting elements one by one.',
    scope: 'origin',
    icon: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3 2"><rect x="3" y="3" width="18" height="18" rx="1"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>',
    configFields: [
      {
        key: 'widthPx',
        label: 'Outline width (px)',
        kind: 'number',
        min: 1,
        hint: 'Thickness of the outlines drawn around every element.',
      },
      {
        key: 'colorMode',
        label: 'Color mode',
        kind: 'select',
        options: [
          { value: 'by-depth', label: 'By nesting depth' },
          { value: 'single', label: 'Single color' },
        ],
        hint: 'By depth cycles a color palette per DOM level, making nesting visible.',
      },
    ],
  },
];
