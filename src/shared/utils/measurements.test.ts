import { describe, expect, it } from 'vitest';
import { clamp, pxToUnit, rectCenter, rectDistances, rectEdgeDistance, type Rect } from './measurements';

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
