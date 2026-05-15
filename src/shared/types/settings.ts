import type { KeyboardShortcut } from '../constants/shortcuts';
import type { ToolIdValue } from '../constants/tools';

export type MeasurementUnit = 'px' | 'rem' | 'em';

export type InspectorPanelSide = 'right' | 'left';

export interface GridSettings {
    columns: number;
    gutterPx: number;
    maxWidthPx: number;
    color: string;
    opacity: number;
}

export interface MagnifierSettings {
    sizePx: number;
    zoomLevel: number;
}

export interface ImageOverlaySettings {
    opacity: number;
    blendMode: string;
    positionX: number;
    positionY: number;
    scale: number;
}

export interface SnapSettings {
    enabled: boolean;
    thresholdPx: number;
}

export interface InspectorPanelSettings {
    side: InspectorPanelSide;
    hideFloatingTooltip: boolean;
}

export interface MultiSelectionSettings {
    // Maximum number of elements that can be selected simultaneously.
    maxItems: number;
}

export interface DistanceLineSettings {
    // Color applied to the dashed distance lines rendered by the inspector and
    // distance-meter tools, as well as the live distance label.
    color: string;
}

export interface BrokenImagesSettings {
    // Background color applied to the placeholder rendered in place of broken
    // <img> elements. Any valid CSS color string (hex preferred).
    backgroundColor: string;
    // Maximum number of characters of the original image URL shown inside the
    // placeholder. Truncation happens from the start, prefixed with `…`.
    urlMaxChars: number;
}

export interface MigrationLogEntry {
    timestamp: number;
    message: string;
}

export interface UserSettings {
    version: number;
    palette: string[];
    shortcuts: Record<ToolIdValue, KeyboardShortcut | null>;
    grid: GridSettings;
    magnifier: MagnifierSettings;
    measurementUnit: MeasurementUnit;
    overlay: Pick<ImageOverlaySettings, 'opacity' | 'blendMode'>;
    selectedPaletteColor: string | null;
    snap: SnapSettings;
    inspectorPanel: InspectorPanelSettings;
    multiSelection: MultiSelectionSettings;
    distanceLine: DistanceLineSettings;
    brokenImages: BrokenImagesSettings;
    showWelcomeMessage: boolean;
    migrationLog: MigrationLogEntry[];
}
