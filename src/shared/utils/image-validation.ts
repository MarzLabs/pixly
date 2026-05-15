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
            message: 'Formato no soportado. Por favor selecciona una imagen en formato PNG, JPG, WEBP o SVG.',
        };
    }

    if (file.size > IMAGE_OVERLAY_DEFAULTS.maxFileSizeBytes) {
        const MB_DIVISOR = 1024 * 1024;
        const maxMb = Math.round(IMAGE_OVERLAY_DEFAULTS.maxFileSizeBytes / MB_DIVISOR);

        return {
            ok: false,
            error: 'file-too-large',
            message: `La imagen excede el tamaño máximo permitido de ${maxMb} MB. Por favor reduce el tamaño y vuelve a intentarlo.`,
        };
    }

    return { ok: true };
}
