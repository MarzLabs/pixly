import type { ContentInboundMessage, ContentToPopupReply } from './messages';

/**
 * Typed wrapper around chrome.tabs.sendMessage for popup/background → content communication.
 * Resolves to a typed reply or an error result if the tab has no listener (e.g. a page where
 * the content script was never injected, like chrome:// URLs).
 */
export async function sendToTab(
  tabId: number,
  message: ContentInboundMessage,
): Promise<ContentToPopupReply> {
  try {
    const reply = (await chrome.tabs.sendMessage(tabId, message)) as
      | ContentToPopupReply
      | undefined;

    return reply ?? { type: 'pixly/error', error: 'No reply from content script' };
  } catch (error) {
    return {
      type: 'pixly/error',
      error: error instanceof Error ? error.message : 'Tab is not reachable',
    };
  }
}
