import { describe, expect, it } from 'vitest';
import { validateImageFile } from './image-validation';

function makeFile(name: string, type: string, sizeBytes: number): File {
    const blob = new Blob([new Uint8Array(sizeBytes)], { type });

    return new File([blob], name, { type });
}

describe('validateImageFile', () => {
    it('accepts supported image MIME types under the size limit', () => {
        // Arrange
        const file = makeFile('design.png', 'image/png', 1024);

        // Act
        const result = validateImageFile(file);

        // Assert
        expect(result.ok).toBe(true);
        expect(result.error).toBeUndefined();
    });

    it('rejects unsupported formats with the expected message', () => {
        // Arrange
        const file = makeFile('design.pdf', 'application/pdf', 1024);

        // Act
        const result = validateImageFile(file);

        // Assert
        expect(result.ok).toBe(false);
        expect(result.error).toBe('unsupported-format');
        expect(result.message).toContain('PNG, JPG, WEBP o SVG');
    });

    it('rejects files larger than the configured limit', () => {
        // Arrange
        const MB = 1024 * 1024;
        const TWENTY_ONE_MB = 21 * MB;
        const file = makeFile('huge.png', 'image/png', TWENTY_ONE_MB);

        // Act
        const result = validateImageFile(file);

        // Assert
        expect(result.ok).toBe(false);
        expect(result.error).toBe('file-too-large');
        expect(result.message).toContain('20 MB');
    });
});
