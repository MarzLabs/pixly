// UI-related dimensions, z-index buckets and default visual values.

export const SHADOW_HOST_ID = 'pixly-shadow-host';

// Elements that carry this attribute are interactive Pixly surfaces (sidebar,
// tooltips with buttons, rulers, etc.). Click handlers use this to distinguish
// clicks that originated inside a real interactive panel from clicks on the
// transparent overlay layer, which must pass through to the page.
export const PIXLY_INTERACTIVE_ATTR = 'data-pixly-interactive';
export const SHADOW_HOST_Z_INDEX = 2147483646;
export const HIGHLIGHT_Z_INDEX = 2147483640;
export const TOOLTIP_Z_INDEX = 2147483645;
export const OVERLAY_Z_INDEX = 2147483600;
export const NOTIFICATION_Z_INDEX = 2147483647;

export const TOOLTIP_OFFSET_PX = 8;
export const TOOLTIP_MAX_WIDTH_PX = 280;
export const VIEWPORT_MARGIN_PX = 8;
export const NOTIFICATION_DURATION_MS = 2000;

export const OUTLINE_THICKNESS_PX = 2;
export const OUTLINE_OFFSET_PX = 0;
export const HIGHLIGHT_FILL_OPACITY = 0.08;

export const SPACING_PADDING_COLOR = 'rgba(126, 217, 87, 0.4)'; // green for padding
export const SPACING_MARGIN_COLOR = 'rgba(255, 165, 0, 0.4)'; // orange for margin

export const PALETTE_MAX_COLORS = 20;

export const DEFAULT_PALETTE: readonly string[] = [
    '#FF5733',
    '#33A1FF',
    '#28A745',
    '#FFC107',
    '#6F42C1',
    '#E83E8C',
    '#17A2B8',
    '#FD7E14',
] as const;

export const GRID_DEFAULTS = {
    columns: 12,
    gutterPx: 16,
    maxWidthPx: 1200,
    color: '#FF00FF',
    opacity: 0.15,
} as const;

export const MAGNIFIER_DEFAULTS = {
    sizePx: 180,
    zoomLevel: 2,
    minZoom: 2,
    maxZoom: 8,
} as const;

export const IMAGE_OVERLAY_DEFAULTS = {
    opacity: 0.5,
    blendMode: 'normal',
    maxFileSizeBytes: 20 * 1024 * 1024, // 20 MB
} as const;

export const SUPPORTED_IMAGE_MIME_TYPES: readonly string[] = [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/svg+xml',
] as const;

export const BLEND_MODES: readonly string[] = [
    'normal',
    'multiply',
    'screen',
    'overlay',
    'difference',
    'exclusion',
] as const;

// Snap-related defaults (v2). The user can tweak the threshold inside the
// configurable range from the popup.
export const SNAP_DEFAULTS = {
    enabled: true,
    thresholdPx: 5,
    minThresholdPx: 1,
    maxThresholdPx: 20,
} as const;

// Inspector panel defaults (v2).
export const INSPECTOR_PANEL_DEFAULTS = {
    side: 'right',
    hideFloatingTooltip: false,
    widthPx: 320,
    minWidthPx: 280,
    maxWidthPx: 420,
} as const;

// Multi-selection defaults (v2).
export const MULTI_SELECTION_DEFAULTS = {
    maxItems: 10,
    minItems: 2,
    maxAllowedItems: 20,
} as const;

// Distance-line color defaults. The default is Tailwind orange-500 because it
// reads well against both the inspector accent indigo and most page palettes.
export const DISTANCE_LINE_DEFAULTS = {
    color: '#F97316',
} as const;

// Broken-images placeholder defaults. Background mirrors the Gray200 design
// token so the placeholder reads as neutral on light and medium backgrounds.
export const BROKEN_IMAGES_DEFAULTS = {
    backgroundColor: '#E4E4E7',
    urlMaxChars: 40,
    minUrlChars: 10,
    maxUrlChars: 120,
    minPlaceholderPx: 50,
    minLabelPx: 80,
    // Pages can contain thousands of <img> tags. Cap the upper bound to avoid
    // pathological worst cases (e.g., infinite-scroll galleries) hanging the
    // page when the tool activates.
    maxObservedImages: 5000,
} as const;

// Nudge step sizes for selected guides (v2).
export const NUDGE_STEP_PX = 1;
export const NUDGE_LARGE_STEP_PX = 10;

// Maximum DOM tree children listed inside the inspector panel before showing
// a "show more" affordance.
export const INSPECTOR_PANEL_MAX_CHILDREN = 20;

// Current settings schema version, used by the migration routine.
export const SETTINGS_SCHEMA_VERSION = 2;
