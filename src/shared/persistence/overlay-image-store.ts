import {
  OVERLAY_DB_NAME,
  OVERLAY_DB_VERSION,
  OVERLAY_STORE_NAME,
} from '@shared/constants';
import type { Result } from '@shared/types';

/**
 * Stores overlay image binaries in IndexedDB so they survive full reloads (spec §7.5) without
 * hitting chrome.storage quotas. Keyed by an opaque string referenced from the light config.
 */

export interface StoredOverlayImage {
  blob: Blob;
  mimeType: string;
  /** Original filename when available; helps the UI label the loaded image. */
  fileName: string | null;
  naturalWidth: number;
  naturalHeight: number;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OVERLAY_DB_NAME, OVERLAY_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(OVERLAY_STORE_NAME)) {
        db.createObjectStore(OVERLAY_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
  });
}

export async function putOverlayImage(
  key: string,
  image: StoredOverlayImage,
): Promise<Result<string>> {
  try {
    const db = await openDatabase();

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(OVERLAY_STORE_NAME, 'readwrite');
      tx.objectStore(OVERLAY_STORE_NAME).put(image, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    });

    db.close();

    return { ok: true, data: key };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Unknown storage error' };
  }
}

export async function getOverlayImage(key: string): Promise<StoredOverlayImage | null> {
  const db = await openDatabase();

  const value = await new Promise<StoredOverlayImage | undefined>((resolve, reject) => {
    const tx = db.transaction(OVERLAY_STORE_NAME, 'readonly');
    const request = tx.objectStore(OVERLAY_STORE_NAME).get(key);
    request.onsuccess = () => resolve(request.result as StoredOverlayImage | undefined);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
  });

  db.close();

  return value ?? null;
}

export async function deleteOverlayImage(key: string): Promise<void> {
  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(OVERLAY_STORE_NAME, 'readwrite');
    tx.objectStore(OVERLAY_STORE_NAME).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
  });

  db.close();
}
