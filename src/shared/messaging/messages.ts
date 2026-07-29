import type { CommandId, ToolId } from '@shared/constants';
import type { PixlyConfig } from '@shared/types';

/**
 * Discriminated-union messages exchanged across extension contexts. The `type` field narrows
 * the payload in every branch, so handlers stay exhaustive and type-safe.
 *
 * Most state sync rides chrome.storage.onChanged (see config-store). Runtime messaging is used
 * only where a context must trigger an imperative action that storage changes cannot express
 * (e.g. the popup asking the active tab which scope keys it currently sees).
 */

/** Sent by the popup to the active tab's content script. */
export type PopupToContentMessage =
  | { type: 'pixly/request-page-context' }
  | { type: 'pixly/toggle-tool'; toolId: ToolId; enabled: boolean }
  | { type: 'pixly/set-global-enabled'; enabled: boolean };

/** Sent by the service worker when a chrome.commands keyboard shortcut fires. */
export type BackgroundToContentMessage = { type: 'pixly/command'; commandId: CommandId };

/** Everything the content script's message listener can receive. */
export type ContentInboundMessage = PopupToContentMessage | BackgroundToContentMessage;

/** Reply describing what the content script knows about the current page. */
export interface PageContext {
  href: string;
  originScopeKey: string;
  urlScopeKey: string;
  activeToolIds: ToolId[];
  globalEnabled: boolean;
}

export type ContentToPopupReply =
  | { type: 'pixly/page-context'; context: PageContext }
  | { type: 'pixly/ack' }
  | { type: 'pixly/error'; error: string };

/** Sent by the service worker / popup to request a host-permission grant for the active tab. */
export type RuntimeMessage =
  | { type: 'pixly/config-snapshot'; config: PixlyConfig }
  | PopupToContentMessage;

export type AnyMessage = ContentInboundMessage | ContentToPopupReply | RuntimeMessage;
