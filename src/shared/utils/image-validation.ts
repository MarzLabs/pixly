// Validates user-provided image files for the overlay feature.

import { IMAGE_OVERLAY_DEFAULTS, SUPPORTED_IMAGE_MIME_TYPES } from '../constants/ui';

export type ImageValidationError =
    | 'unsupported-format'
    | 'file-too-large';

export interface ImageValidationResult {
    ok: boolean;
    error?: ImageValidationError;
    message?: string;
}

export function validateImageFile(file: File): ImageValidationResult {
    if (!SUPPORTED_IMAGE_MIME_TYPES.includes(file.type)) {
        return {
            ok: false,
            error: 'unsupported-format',
            message: 'Unsupported format. Please select an image in PNG, JPG, WEBP, or SVG format.',
        };
    }

    if (file.size > IMAGE_OVERLAY_DEFAULTS.maxFileSizeBytes) {
        const MB_DIVISOR = 1024 * 1024;
        const maxMb = Math.round(IMAGE_OVERLAY_DEFAULTS.maxFileSizeBytes / MB_DIVISOR);

        return {
            ok: false,
            error: 'file-too-large',
            message: `The image exceeds the maximum size of ${maxMb} MB. Please reduce its size and try again.`,
        };
    }

    return { ok: true };
}
