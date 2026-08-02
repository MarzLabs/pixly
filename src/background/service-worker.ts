import { createEmptyConfig } from '@shared/persistence/config-document';
import { isCommandId, STORAGE_ROOT_KEY } from '@shared/constants';
import type {
  BackgroundInboundMessage,
  CaptureReply,
  LicenseReply,
} from '@shared/messaging/messages';
import { sendToTab } from '@shared/messaging/send';
import { verifyLicenseWithGumroad } from '@shared/licensing/gumroad';
import { maxActivations } from '@shared/licensing/license-plan';
import {
  ensureTrialSeeded,
  loadLicenseDocument,
  saveLicenseDocument,
} from '@shared/licensing/license-store';

/**
 * MV3 service worker (spec §9). Coordinates extension-level concerns: seeds an empty config on
 * install so the popup and content scripts always read a valid document, forwards keyboard
 * shortcuts (chrome.commands) to the tab's content script, and captures the visible tab for the
 * Snapshot tool (chrome.tabs.captureVisibleTab only exists in extension contexts). Per-page
 * effects are handled entirely by the content script.
 *
 * It also owns licensing (spec: Gumroad): seeds the 15-day trial start, activates license keys
 * against Gumroad on behalf of the popup, and re-checks the stored key on a daily alarm so
 * refunds/chargebacks eventually revoke Pro. Plan gating itself happens in the content script
 * and popup from the shared license document.
 */

const LICENSE_RECHECK_ALARM = 'pixly-license-recheck';

chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.local.get(STORAGE_ROOT_KEY);

  if (!existing[STORAGE_ROOT_KEY]) {
    await chrome.storage.local.set({ [STORAGE_ROOT_KEY]: createEmptyConfig() });
  }

  await ensureTrialSeeded(new Date().toISOString());
  await scheduleLicenseRecheck();
});

// Alarms survive browser restarts, but re-asserting them (and the trial seed) on startup keeps
// licensing healthy even if an install-time write was interrupted.
chrome.runtime.onStartup.addListener(() => {
  void ensureTrialSeeded(new Date().toISOString());
  void scheduleLicenseRecheck();
});

// Commands carry the tab they fired on; fall back to the active tab (e.g. commands with no tab
// context). Pages without the content script (chrome://) resolve to a typed error we can ignore.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (!isCommandId(command)) {
    return;
  }

  const tabId = tab?.id ?? (await findActiveTabId());

  if (tabId === undefined) {
    return;
  }

  await sendToTab(tabId, { type: 'pixly/command', commandId: command });
});

async function findActiveTabId(): Promise<number | undefined> {
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  return activeTab?.id;
}

// Capture requests from content scripts and license actions from the popup. Capture fails (with
// a typed error the tool surfaces) when activeTab is not currently granted for the tab — e.g.
// after a reload without reopening the popup.
chrome.runtime.onMessage.addListener(
  (
    message: BackgroundInboundMessage,
    sender,
    sendResponse: (reply: CaptureReply | LicenseReply) => void,
  ) => {
    switch (message?.type) {
      case 'pixly/capture-visible-tab':
        void captureVisibleTab(sender.tab?.windowId)
          .then((dataUrl) => sendResponse({ ok: true, dataUrl }))
          .catch((error: unknown) =>
            sendResponse({
              ok: false,
              error: error instanceof Error ? error.message : 'Capture failed',
            }),
          );
        break;
      case 'pixly/activate-license':
        void activateLicense(message.licenseKey).then(sendResponse);
        break;
      case 'pixly/remove-license':
        void removeLicense().then(sendResponse);
        break;
      default:
        return;
    }

    // Returning true keeps the message channel open for the async reply.
    return true;
  },
);

function captureVisibleTab(windowId: number | undefined): Promise<string> {
  const options: chrome.tabs.CaptureVisibleTabOptions = { format: 'png' };

  return windowId === undefined
    ? chrome.tabs.captureVisibleTab(options)
    : chrome.tabs.captureVisibleTab(windowId, options);
}

/**
 * Verifies a key the user pasted in the popup and stores it only when Gumroad confirms it,
 * enforcing the seat limit: each purchased seat covers {@link ACTIVATIONS_PER_SEAT} devices,
 * counted through Gumroad's "uses" counter. The check runs against a non-incrementing probe
 * first, so a rejected attempt (seats exhausted, refunded key) never burns an activation; only
 * the follow-up commit call increments the counter.
 */
async function activateLicense(licenseKey: string): Promise<LicenseReply> {
  const key = licenseKey.trim();

  if (!key) {
    return { ok: false, error: 'Enter a license key.' };
  }

  const doc = await loadLicenseDocument();
  // Re-activating the key this device already holds must be idempotent, not eat a second seat.
  const alreadyActive = doc.licenseKey === key;

  const probe = await verifyLicenseWithGumroad(key, { incrementUsesCount: false });

  if (!probe.ok) {
    return { ok: false, error: probe.error };
  }

  if (!probe.data.valid) {
    return { ok: false, error: probe.data.reason };
  }

  if (!alreadyActive) {
    const allowed = maxActivations(probe.data.quantity);

    if (probe.data.uses !== null && probe.data.uses >= allowed) {
      return {
        ok: false,
        error: `This license is already activated on its maximum of ${allowed} devices.`,
      };
    }

    const commit = await verifyLicenseWithGumroad(key, { incrementUsesCount: true });

    if (!commit.ok) {
      return { ok: false, error: commit.error };
    }

    if (!commit.data.valid) {
      return { ok: false, error: commit.data.reason };
    }
  }

  await saveLicenseDocument({
    ...doc,
    licenseKey: key,
    verification: { valid: true, checkedAtIso: new Date().toISOString() },
  });

  return { ok: true };
}

async function removeLicense(): Promise<LicenseReply> {
  const doc = await loadLicenseDocument();
  await saveLicenseDocument({ ...doc, licenseKey: null, verification: null });

  return { ok: true };
}

async function scheduleLicenseRecheck(): Promise<void> {
  const existing = await chrome.alarms.get(LICENSE_RECHECK_ALARM);

  if (!existing) {
    await chrome.alarms.create(LICENSE_RECHECK_ALARM, { periodInMinutes: 60 * 24 });
  }
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === LICENSE_RECHECK_ALARM) {
    void recheckLicense();
  }
});

/**
 * Re-validates the stored key so refunds and chargebacks eventually revoke Pro. Indeterminate
 * results (offline, Gumroad down) change nothing — a paying user is never downgraded by a
 * network hiccup, only by a definitive "invalid" from Gumroad.
 */
async function recheckLicense(): Promise<void> {
  const doc = await loadLicenseDocument();

  if (!doc.licenseKey) {
    return;
  }

  const result = await verifyLicenseWithGumroad(doc.licenseKey, { incrementUsesCount: false });

  if (!result.ok) {
    return;
  }

  await saveLicenseDocument({
    ...doc,
    verification: {
      valid: result.data.valid,
      checkedAtIso: new Date().toISOString(),
      ...(result.data.valid ? {} : { reason: result.data.reason }),
    },
  });
}
