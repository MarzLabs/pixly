import { describe, expect, it } from 'vitest';
import { buildElementSpecs, formatSpecsForClipboard } from './css-specs';

describe('buildElementSpecs', () => {
    it('extracts dimensions, spacing, typography, background, border, shadow and position', () => {
        // Arrange
        const div = document.createElement('div');
        div.style.padding = '8px';
        div.style.margin = '12px';
        div.style.fontFamily = 'Arial';
        div.style.fontSize = '16px';
        div.style.color = 'rgb(255, 0, 0)';
        div.style.backgroundColor = 'rgb(0, 0, 255)';
        document.body.appendChild(div);

        // Act
        const specs = buildElementSpecs(div);

        // Assert
        expect(specs.tag).toBe('div');
        expect(specs.typography.fontFamily).toContain('Arial');
        expect(specs.typography.colorHex).toBe('#FF0000');
        expect(specs.background.backgroundColorHex).toBe('#0000FF');

        // Cleanup
        document.body.removeChild(div);
    });
});

describe('formatSpecsForClipboard', () => {
    it('produces a multi-line text grouped by sections', () => {
        // Arrange
        const div = document.createElement('div');
        document.body.appendChild(div);
        const specs = buildElementSpecs(div);

        // Act
        const text = formatSpecsForClipboard(specs);

        // Assert
        expect(text).toContain('## Dimensiones');
        expect(text).toContain('## Tipografía');
        expect(text).toContain('## Posicionamiento');

        // Cleanup
        document.body.removeChild(div);
    });
});
