import type { ToolIdValue } from '../constants/tools';
import type { UserSettings } from './settings';

// Discriminated union of every message the extension exchanges.
// Adding a new message requires extending this union, which keeps handlers
// type-safe and exhaustive.

export const MessageType = {
    // popup <-> content
    ToggleTool: 'toggle-tool',
    GetActiveTools: 'get-active-tools',
    GetActiveToolsResponse: 'get-active-tools-response',
    DisableAllTools: 'disable-all-tools',
    UpdateSettings: 'update-settings',
    ClearAppliedStyles: 'clear-applied-styles',
    LoadOverlayImage: 'load-overlay-image',
    RemoveOverlayImage: 'remove-overlay-image',
    UpdateOverlayState: 'update-overlay-state',
    TakeSnapshot: 'take-snapshot',
    TakeSnapshotResponse: 'take-snapshot-response',
    ShowSideBySide: 'show-side-by-side',
    GetOverlayState: 'get-overlay-state',
    GetOverlayStateResponse: 'get-overlay-state-response',
    OverlayStateChanged: 'overlay-state-changed',

    // service worker triggers
    CommandTriggered: 'command-triggered',

    // notifications from content -> popup
    NotifyError: 'notify-error',
} as const;

export type MessageTypeValue = (typeof MessageType)[keyof typeof MessageType];

interface BaseMessage<T extends MessageTypeValue, P = void> {
    type: T;
    payload: P;
}

export type ToggleToolMessage = BaseMessage<typeof MessageType.ToggleTool, {
    toolId: ToolIdValue;
    enabled: boolean;
}>;

export type GetActiveToolsMessage = BaseMessage<typeof MessageType.GetActiveTools, void>;

export type GetActiveToolsResponseMessage = BaseMessage<typeof MessageType.GetActiveToolsResponse, {
    activeTools: ToolIdValue[];
}>;

export type DisableAllToolsMessage = BaseMessage<typeof MessageType.DisableAllTools, void>;

export type UpdateSettingsMessage = BaseMessage<typeof MessageType.UpdateSettings, {
    settings: UserSettings;
}>;

export type ClearAppliedStylesMessage = BaseMessage<typeof MessageType.ClearAppliedStyles, void>;

export type LoadOverlayImageMessage = BaseMessage<typeof MessageType.LoadOverlayImage, {
    dataUrl: string;
    fileName: string;
    width: number;
    height: number;
}>;

export type RemoveOverlayImageMessage = BaseMessage<typeof MessageType.RemoveOverlayImage, void>;

export type UpdateOverlayStateMessage = BaseMessage<typeof MessageType.UpdateOverlayState, {
    opacity?: number;
    blendMode?: string;
    positionX?: number;
    positionY?: number;
    visible?: boolean;
    scale?: number;
    width?: number;
    height?: number;
    locked?: boolean;
}>;

export type TakeSnapshotMessage = BaseMessage<typeof MessageType.TakeSnapshot, void>;

export type TakeSnapshotResponseMessage = BaseMessage<typeof MessageType.TakeSnapshotResponse, {
    dataUrl: string | null;
    error?: string;
}>;

export type ShowSideBySideMessage = BaseMessage<typeof MessageType.ShowSideBySide, {
    snapshotDataUrl: string;
    overlayDataUrl: string;
}>;

export type GetOverlayStateMessage = BaseMessage<typeof MessageType.GetOverlayState, void>;

export type GetOverlayStateResponseMessage = BaseMessage<typeof MessageType.GetOverlayStateResponse, {
    loaded: boolean;
    locked: boolean;
    scalePercent: number;
}>;

// Fired by the content script when the overlay's lock state or scale changes
// from within the page (Alt+L, drag-resize, keyboard nudge), so any open popup
// can keep its toggle and scale badge in sync.
export type OverlayStateChangedMessage = BaseMessage<typeof MessageType.OverlayStateChanged, {
    loaded: boolean;
    locked: boolean;
    scalePercent: number;
}>;

export type CommandTriggeredMessage = BaseMessage<typeof MessageType.CommandTriggered, {
    command: string;
}>;

export type NotifyErrorMessage = BaseMessage<typeof MessageType.NotifyError, {
    message: string;
}>;

export type PixlyMessage =
    | ToggleToolMessage
    | GetActiveToolsMessage
    | GetActiveToolsResponseMessage
    | DisableAllToolsMessage
    | UpdateSettingsMessage
    | ClearAppliedStylesMessage
    | LoadOverlayImageMessage
    | RemoveOverlayImageMessage
    | UpdateOverlayStateMessage
    | TakeSnapshotMessage
    | TakeSnapshotResponseMessage
    | ShowSideBySideMessage
    | GetOverlayStateMessage
    | GetOverlayStateResponseMessage
    | OverlayStateChangedMessage
    | CommandTriggeredMessage
    | NotifyErrorMessage;
