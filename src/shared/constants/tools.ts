// Single source of truth for the tool identifiers exposed by the extension.
// These IDs are used in messages, storage keys and DOM attributes.

export const ToolId = {
    Inspector: 'inspector',
    Typography: 'typography',
    ColorPicker: 'color-picker',
    GlobalOutlines: 'global-outlines',
    InspectSpacing: 'inspect-spacing',
    GridOverlay: 'grid-overlay',
    Rulers: 'rulers',
    DistanceMeter: 'distance-meter',
    Magnifier: 'magnifier',
    ImageOverlay: 'image-overlay',
    Snapshot: 'snapshot',
    FreeGuides: 'free-guides',
    InspectorPanel: 'inspector-panel',
    BrokenImages: 'broken-images',
} as const;

export type ToolIdValue = (typeof ToolId)[keyof typeof ToolId];

export const TOOL_LABELS: Record<ToolIdValue, string> = {
    [ToolId.Inspector]: 'Element inspector',
    [ToolId.Typography]: 'Typography inspector',
    [ToolId.ColorPicker]: 'Color picker',
    [ToolId.GlobalOutlines]: 'Global outlines',
    [ToolId.InspectSpacing]: 'Inspect spacing',
    [ToolId.GridOverlay]: 'Grid overlay',
    [ToolId.Rulers]: 'Rulers & guides',
    [ToolId.DistanceMeter]: 'Distance meter',
    [ToolId.Magnifier]: 'Magnifier',
    [ToolId.ImageOverlay]: 'Image overlay',
    [ToolId.Snapshot]: 'Snapshot & compare',
    [ToolId.FreeGuides]: 'Free guides',
    [ToolId.InspectorPanel]: 'Inspector panel',
    [ToolId.BrokenImages]: 'Fix broken images',
};

// Tools belonging to each stage. Useful to render the popup grouped.
export const STAGE_1_TOOLS: ToolIdValue[] = [
    ToolId.Inspector,
    ToolId.InspectorPanel,
    ToolId.Typography,
    ToolId.ColorPicker,
    ToolId.GlobalOutlines,
    ToolId.InspectSpacing,
    ToolId.GridOverlay,
    ToolId.Rulers,
    ToolId.FreeGuides,
    ToolId.DistanceMeter,
    ToolId.Magnifier,
    ToolId.BrokenImages,
];

export const STAGE_2_TOOLS: ToolIdValue[] = [
    ToolId.ImageOverlay,
    ToolId.Snapshot,
];

// Tools whose active state is remembered per-origin and restored on reload
// (session scoped, cleared when the browser closes). Limited to ambient
// overlays that annotate the page passively; one-shot or modal tools
// (snapshot, color picker, magnifier, …) are intentionally excluded because
// auto-activating them on load would be surprising rather than helpful.
export const SESSION_RESTORABLE_TOOLS: ToolIdValue[] = [
    ToolId.BrokenImages,
    ToolId.GridOverlay,
    ToolId.GlobalOutlines,
    ToolId.Rulers,
    ToolId.Typography,
    ToolId.FreeGuides,
];
