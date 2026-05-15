import { describe, expect, it } from 'vitest';
import {
    clamp,
    clipSegmentToViewport,
    pxToUnit,
    rectCenter,
    rectDistances,
    rectEdgeDistance,
    type Rect,
} from './measurements';

function makeRect(top: number, left: number, width: number, height: number): Rect {
    return {
        top,
        left,
        right: left + width,
        bottom: top + height,
        width,
        height,
    };
}

describe('rectCenter', () => {
    it('returns the geometric center of a rectangle', () => {
        // Arrange
        const rect = makeRect(10, 20, 100, 50);

        // Act
        const center = rectCenter(rect);

        // Assert
        expect(center).toEqual({ x: 70, y: 35 });
    });
});

describe('rectEdgeDistance', () => {
    it('returns zero on overlapping rectangles', () => {
        // Arrange
        const a = makeRect(0, 0, 100, 100);
        const b = makeRect(50, 50, 100, 100);

        // Act
        const distance = rectEdgeDistance(a, b);

        // Assert
        expect(distance).toEqual({ horizontal: 0, vertical: 0 });
    });

    it('returns gap distances when rectangles are separated', () => {
        // Arrange
        const a = makeRect(0, 0, 50, 50);
        const b = makeRect(80, 100, 50, 50);

        // Act
        const distance = rectEdgeDistance(a, b);

        // Assert
        expect(distance).toEqual({ horizontal: 50, vertical: 30 });
    });
});

describe('rectDistances', () => {
    it('computes horizontal, vertical and diagonal distances', () => {
        // Arrange
        const a = makeRect(0, 0, 10, 10);
        const b = makeRect(0, 30, 10, 10);

        // Act
        const result = rectDistances(a, b);

        // Assert
        expect(result.horizontal).toBe(20);
        expect(result.vertical).toBe(0);
        expect(Math.round(result.diagonal)).toBe(30);
    });
});

describe('pxToUnit', () => {
    it('formats px values with no decimals', () => {
        // Arrange / Act / Assert
        expect(pxToUnit(15.6, 'px')).toBe('16px');
    });

    it('formats rem and em with 2 decimals based on default base size', () => {
        // Arrange / Act / Assert
        expect(pxToUnit(32, 'rem')).toBe('2.00rem');
        expect(pxToUnit(24, 'em')).toBe('1.50em');
    });
});

describe('clamp', () => {
    it('keeps the value inside the inclusive range', () => {
        // Arrange / Act / Assert
        expect(clamp(5, 0, 10)).toBe(5);
        expect(clamp(-1, 0, 10)).toBe(0);
        expect(clamp(15, 0, 10)).toBe(10);
    });
});

describe('clipSegmentToViewport', () => {
    const viewport = { width: 1000, height: 800 };
    const margin = 4;

    it('returns the original endpoints when the segment is fully inside the viewport', () => {
        // Arrange
        const start = { x: 100, y: 200 };
        const end = { x: 400, y: 200 };

        // Act
        const result = clipSegmentToViewport(start, end, viewport, margin);

        // Assert
        expect(result.start).toEqual(start);
        expect(result.end).toEqual(end);
        expect(result.clippedStart).toBe(false);
        expect(result.clippedEnd).toBe(false);
        expect(result.visibleLength).toBe(300);
    });

    it('clips a horizontal segment that extends past the left edge', () => {
        // Arrange
        const start = { x: -50, y: 100 };
        const end = { x: 200, y: 100 };

        // Act
        const result = clipSegmentToViewport(start, end, viewport, margin);

        // Assert
        expect(result.start).toEqual({ x: margin, y: 100 });
        expect(result.end).toEqual(end);
        expect(result.clippedStart).toBe(true);
        expect(result.clippedEnd).toBe(false);
        expect(result.visibleLength).toBe(200 - margin);
    });

    it('clips a horizontal segment that extends past the right edge', () => {
        // Arrange
        const start = { x: 800, y: 100 };
        const end = { x: 1200, y: 100 };

        // Act
        const result = clipSegmentToViewport(start, end, viewport, margin);

        // Assert
        expect(result.start).toEqual(start);
        expect(result.end).toEqual({ x: viewport.width - margin, y: 100 });
        expect(result.clippedStart).toBe(false);
        expect(result.clippedEnd).toBe(true);
        expect(result.visibleLength).toBe(viewport.width - margin - 800);
    });

    it('clips a vertical segment that extends past the top edge', () => {
        // Arrange
        const start = { x: 200, y: -30 };
        const end = { x: 200, y: 150 };

        // Act
        const result = clipSegmentToViewport(start, end, viewport, margin);

        // Assert
        expect(result.start).toEqual({ x: 200, y: margin });
        expect(result.end).toEqual(end);
        expect(result.clippedStart).toBe(true);
        expect(result.clippedEnd).toBe(false);
        expect(result.visibleLength).toBe(150 - margin);
    });

    it('clips both ends of a vertical segment that extends past both edges', () => {
        // Arrange
        const start = { x: 200, y: -50 };
        const end = { x: 200, y: 900 };

        // Act
        const result = clipSegmentToViewport(start, end, viewport, margin);

        // Assert
        expect(result.start).toEqual({ x: 200, y: margin });
        expect(result.end).toEqual({ x: 200, y: viewport.height - margin });
        expect(result.clippedStart).toBe(true);
        expect(result.clippedEnd).toBe(true);
        expect(result.visibleLength).toBe(viewport.height - margin * 2);
    });

    it('returns zero visible length when the segment is fully outside the viewport', () => {
        // Arrange
        const start = { x: -200, y: 100 };
        const end = { x: -50, y: 100 };

        // Act
        const result = clipSegmentToViewport(start, end, viewport, margin);

        // Assert
        expect(result.start).toEqual({ x: margin, y: 100 });
        expect(result.end).toEqual({ x: margin, y: 100 });
        expect(result.clippedStart).toBe(true);
        expect(result.clippedEnd).toBe(true);
        expect(result.visibleLength).toBe(0);
    });

    it('throws when given a diagonal (non axis-aligned) segment', () => {
        // Arrange
        const start = { x: 0, y: 0 };
        const end = { x: 100, y: 100 };

        // Act / Assert
        expect(() => clipSegmentToViewport(start, end, viewport, margin))
            .toThrow(/axis-aligned/);
    });
});
