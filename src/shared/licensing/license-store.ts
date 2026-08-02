import { createEmptyLicenseDocument, type LicenseDocument } from './license-plan';

/**
 * I/O boundary for the {@link LicenseDocument}, mirroring config-store's shape: a single
 * chrome.storage.local document plus a change subscription. The trial start additionally lives in
 * chrome.storage.sync, which Chrome restores for signed-in profiles after a remove-and-reinstall,
 * so reinstalling does not grant a fresh trial.
 */

/** chrome.storage.local key of the license document. */
export const LICENSE_STORAGE_KEY = 'pixly:license:v1';

/** chrome.storage.sync key mirroring the trial start across reinstalls. */
const TRIAL_SYNC_KEY = 'pixly:trial-started-at';

export async function loadLicenseDocument(): Promise<LicenseDocument> {
  const result = await chrome.storage.local.get(LICENSE_STORAGE_KEY);
  const stored = result[LICENSE_STORAGE_KEY] as LicenseDocument | undefined;

  return stored ?? createEmptyLicenseDocument();
}

export async function saveLicenseDocument(doc: LicenseDocument): Promise<void> {
  await chrome.storage.local.set({ [LICENSE_STORAGE_KEY]: doc });
}

/** Subscribes to cross-context license changes (worker ↔ popup ↔ content). Returns unsubscribe. */
export function onLicenseChanged(listener: (doc: LicenseDocument) => void): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== 'local' || !(LICENSE_STORAGE_KEY in changes)) {
      return;
    }

    const next = changes[LICENSE_STORAGE_KEY]?.newValue as LicenseDocument | undefined;
    listener(next ?? createEmptyLicenseDocument());
  };

  chrome.storage.onChanged.addListener(handler);

  return () => chrome.storage.onChanged.removeListener(handler);
}

/**
 * Seeds the trial start once, preferring the storage.sync copy over starting a fresh trial.
 * Called by the service worker on install and browser startup; a no-op when already seeded.
 * sync failures (e.g. sync quota, enterprise policy) are non-fatal — the local copy rules.
 */
export async function ensureTrialSeeded(nowIso: string): Promise<void> {
  const doc = await loadLicenseDocument();

  if (doc.trialStartedAtIso) {
    await chrome.storage.sync.set({ [TRIAL_SYNC_KEY]: doc.trialStartedAtIso }).catch(() => {});

    return;
  }

  const synced = await chrome.storage.sync.get(TRIAL_SYNC_KEY).catch(() => ({}) as never);
  const syncedIso = (synced as Record<string, unknown>)[TRIAL_SYNC_KEY];
  const trialStartedAtIso = typeof syncedIso === 'string' ? syncedIso : nowIso;

  await saveLicenseDocument({ ...doc, trialStartedAtIso });
  await chrome.storage.sync.set({ [TRIAL_SYNC_KEY]: trialStartedAtIso }).catch(() => {});
}
