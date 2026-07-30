import type { Result } from '@shared/types';
import type { StoredOverlayImage } from '@shared/persistence/overlay-image-store';

/**
 * Validates and reads an image file/blob into a {@link StoredOverlayImage}, including its natural
 * dimensions. Surfaces a user-facing English error for unsupported or corrupt files (spec §7.7).
 */

export const ACCEPTED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/svg+xml',
  'image/gif',
] as const;

/** Soft cap (bytes) above which we warn the user that persistence may fail (spec §7.7). */
export const PERSIST_WARN_BYTES = 8 * 1024 * 1024;

export function isAcceptedType(mimeType: string): boolean {
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(mimeType);
}

export async function readImageBlob(
  blob: Blob,
  fileName: string | null,
): Promise<Result<StoredOverlayImage>> {
  if (!isAcceptedType(blob.type)) {
    return { ok: false, error: `Unsupported image type: ${blob.type || 'unknown'}` };
  }

  const objectUrl = URL.createObjectURL(blob);

  try {
    const dimensions = await measureImage(objectUrl);

    return {
      ok: true,
      data: {
        blob,
        mimeType: blob.type,
        fileName,
        naturalWidth: dimensions.width,
        naturalHeight: dimensions.height,
      },
    };
  } catch {
    return { ok: false, error: 'The image could not be decoded (it may be corrupt).' };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function measureImage(objectUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const probe = new Image();

    probe.onload = () => resolve({ width: probe.naturalWidth, height: probe.naturalHeight });
    probe.onerror = () => reject(new Error('decode failed'));
    probe.src = objectUrl;
  });
}

/** Extracts the first image file from a clipboard/drag DataTransfer, if any. */
export function extractImageFile(dataTransfer: DataTransfer | null): File | null {
  if (!dataTransfer) {
    return null;
  }

  for (const item of Array.from(dataTransfer.files)) {
    if (item.type.startsWith('image/')) {
      return item;
    }
  }

  return null;
}
