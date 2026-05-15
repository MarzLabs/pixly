// Central registry that wires tool IDs to their concrete implementations and
// maintains active state across the page lifecycle.

import { ToolId, type ToolIdValue } from '@/shared/constants/tools';
import { BrokenImagesTool } from './tools/broken-images-tool';
import { ColorApplierTool } from './tools/color-applier-tool';
import { ColorPickerTool } from './tools/color-picker-tool';
import { DistanceMeterTool } from './tools/distance-meter-tool';
import { GlobalOutlinesTool } from './tools/global-outlines-tool';
import { GridOverlayTool } from './tools/grid-overlay-tool';
import { InspectorPanelTool } from './tools/inspector-panel-tool';
import { InspectorTool } from './tools/inspector-tool';
import { InspectSpacingTool } from './tools/inspect-spacing-tool';
import { MagnifierTool } from './tools/magnifier-tool';
import { RulersTool } from './tools/rulers-tool';
import { TypographyTool } from './tools/typography-tool';
import { FreeGuidesTool } from './tools/free-guides-tool';
import { ImageOverlayTool } from './overlay/image-overlay-tool';
import { SnapshotTool } from './overlay/snapshot-tool';
import type { Tool } from './tools/tool';

export interface RegistryEntry {
    id: ToolIdValue;
    tool: Tool;
    // Some tools (e.g., color applier) ride on top of the inspector and should
    // not be exposed as a standalone toggle in the popup.
    dependsOn?: ToolIdValue;
}

export function createToolRegistry(): RegistryEntry[] {
    return [
        { id: ToolId.Inspector, tool: new InspectorTool() },
        { id: ToolId.InspectorPanel, tool: new InspectorPanelTool() },
        { id: ToolId.Typography, tool: new TypographyTool() },
        { id: ToolId.ColorPicker, tool: new ColorPickerTool() },
        { id: ToolId.GlobalOutlines, tool: new GlobalOutlinesTool() },
        { id: ToolId.InspectSpacing, tool: new InspectSpacingTool() },
        { id: ToolId.GridOverlay, tool: new GridOverlayTool() },
        { id: ToolId.Rulers, tool: new RulersTool() },
        { id: ToolId.FreeGuides, tool: new FreeGuidesTool() },
        { id: ToolId.DistanceMeter, tool: new DistanceMeterTool() },
        { id: ToolId.Magnifier, tool: new MagnifierTool() },
        { id: ToolId.ImageOverlay, tool: new ImageOverlayTool() },
        { id: ToolId.Snapshot, tool: new SnapshotTool() },
        { id: ToolId.BrokenImages, tool: new BrokenImagesTool() },
    ];
}

export class ColorApplierAddon {
    private readonly applier = new ColorApplierTool();
    private active = false;

    activate(): ColorApplierTool {
        return this.applier;
    }

    isActive(): boolean {
        return this.active;
    }

    setActive(active: boolean): void {
        this.active = active;
    }
}
