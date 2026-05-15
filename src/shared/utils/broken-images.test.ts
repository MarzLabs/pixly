import { describe, expect, it } from 'vitest';
import {
    clampUrlMaxChars,
    decidePlaceholderSize,
    evaluateImage,
    truncateUrl,
    type ImageProbe,
} from './broken-images';
import { BROKEN_IMAGES_DEFAULTS } from '../constants/ui';

const VALID_PROBE: ImageProbe = {
    complete: true,
    naturalWidth: 100,
    naturalHeight: 80,
    hasErrored: false,
    src: 'https://example.com/foo.png',
};

describe('evaluateImage', () => {
    it('flags an image that fired the error event as broken', () => {
        // Arrange
        const probe: ImageProbe = { ...VALID_PROBE, hasErrored: true };

        // Act
        const result = evaluateImage(probe);

        // Assert
        expect(result.isBroken).toBe(true);
        expect(result.reason).toBe('error-event');
    });

    it('flags a completed image with zero natural dimensions as broken', () => {
        // Arrange
        const probe: ImageProbe = { ...VALID_PROBE, naturalWidth: 0, naturalHeight: 0 };

        // Act
        const result = evaluateImage(probe);

        // Assert
        expect(result.isBroken).toBe(true);
        expect(result.reason).toBe('natural-zero');
    });

    it('reports still-loading when the image has not completed yet', () => {
        // Arrange
        const probe: ImageProbe = { ...VALID_PROBE, complete: false };

        // Act
        const result = evaluateImage(probe);

        // Assert
        expect(result.isBroken).toBe(false);
        expect(result.reason).toBe('still-loading');
    });

    it('does not flag a fully loaded image with positive dimensions', () => {
        // Arrange
        const probe = VALID_PROBE;

        // Act
        const result = evaluateImage(probe);

        // Assert
        expect(result.isBroken).toBe(false);
        expect(result.reason).toBe('loaded');
    });

    it('ignores images with empty or missing src per product decision', () => {
        // Arrange
        const probes: ImageProbe[] = [
            { ...VALID_PROBE, src: null, naturalWidth: 0, naturalHeight: 0 },
            { ...VALID_PROBE, src: '', naturalWidth: 0, naturalHeight: 0 },
            { ...VALID_PROBE, src: '   ', naturalWidth: 0, naturalHeight: 0 },
        ];

        // Act
        const results = probes.map(evaluateImage);

        // Assert
        for (const result of results) {
            expect(result.isBroken).toBe(false);
            expect(result.reason).toBe('loaded');
        }
    });

    it('prioritizes the error event over the still-loading state', () => {
        // Arrange
        const probe: ImageProbe = { ...VALID_PROBE, complete: false, hasErrored: true };

        // Act
        const result = evaluateImage(probe);

        // Assert
        expect(result.isBroken).toBe(true);
        expect(result.reason).toBe('error-event');
    });
});

describe('truncateUrl', () => {
    it('returns the URL untouched when shorter than max chars', () => {
        // Arrange
        const url = 'https://x.io/a.png';

        // Act
        const result = truncateUrl(url, 40);

        // Assert
        expect(result).toBe(url);
    });

    it('truncates from the start prefixed with an ellipsis', () => {
        // Arrange
        const url = 'https://example.com/path/to/some/long/asset/file.png';
        const maxChars = 20;

        // Act
        const result = truncateUrl(url, maxChars);

        // Assert
        expect(result.length).toBe(maxChars);
        expect(result.startsWith('…')).toBe(true);
        expect(url.endsWith(result.slice(1))).toBe(true);
    });

    it('returns the original URL when maxChars is invalid or too small', () => {
        // Arrange
        const url = 'https://example.com/foo';

        // Act
        const tooSmall = truncateUrl(url, 1);
        const negative = truncateUrl(url, -10);
        const nan = truncateUrl(url, Number.NaN);

        // Assert
        expect(tooSmall).toBe(url);
        expect(negative).toBe(url);
        expect(nan).toBe(url);
    });
});

describe('clampUrlMaxChars', () => {
    it('clamps below the minimum to the minimum value', () => {
        // Act
        const result = clampUrlMaxChars(2);

        // Assert
        expect(result).toBe(BROKEN_IMAGES_DEFAULTS.minUrlChars);
    });

    it('clamps above the maximum to the maximum value', () => {
        // Act
        const result = clampUrlMaxChars(10_000);

        // Assert
        expect(result).toBe(BROKEN_IMAGES_DEFAULTS.maxUrlChars);
    });

    it('falls back to the default when value is not finite', () => {
        // Act
        const result = clampUrlMaxChars(Number.NaN);

        // Assert
        expect(result).toBe(BROKEN_IMAGES_DEFAULTS.urlMaxChars);
    });

    it('preserves an in-range integer value', () => {
        // Act
        const result = clampUrlMaxChars(55);

        // Assert
        expect(result).toBe(55);
    });
});

describe('decidePlaceholderSize', () => {
    it('keeps the rendered size unchanged when above the minimum', () => {
        // Act
        const result = decidePlaceholderSize(320, 180);

        // Assert
        expect(result.width).toBe(320);
        expect(result.height).toBe(180);
        expect(result.showLabel).toBe(true);
    });

    it('upgrades a 0x0 image to the configured minimum and hides the label below threshold', () => {
        // Act
        const result = decidePlaceholderSize(0, 0);

        // Assert
        expect(result.width).toBe(BROKEN_IMAGES_DEFAULTS.minPlaceholderPx);
        expect(result.height).toBe(BROKEN_IMAGES_DEFAULTS.minPlaceholderPx);
        expect(result.showLabel).toBe(false);
    });

    it('never enlarges an image that already has a positive but small size', () => {
        // Act — a 20×20 image stays at 20×20 because enlarging it would
        // alter the page layout, which the spec forbids.
        const result = decidePlaceholderSize(20, 20);

        // Assert
        expect(result.width).toBe(20);
        expect(result.height).toBe(20);
        expect(result.showLabel).toBe(false);
    });

    it('rounds fractional dimensions to integer pixels', () => {
        // Act
        const result = decidePlaceholderSize(123.4, 56.6);

        // Assert
        expect(result.width).toBe(123);
        expect(result.height).toBe(57);
    });
});
