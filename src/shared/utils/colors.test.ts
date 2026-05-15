import { describe, expect, it } from 'vitest';
import {
    cssColorToHex,
    cssColorToRgbString,
    expandShortHex,
    formatRgb,
    hexToRgb,
    isLightColor,
    isValidHexColor,
    parseRgbString,
    rgbToHex,
} from './colors';

describe('isValidHexColor', () => {
    it('accepts short and long hex notations, case-insensitive', () => {
        // Arrange / Act / Assert
        expect(isValidHexColor('#fff')).toBe(true);
        expect(isValidHexColor('#FFF')).toBe(true);
        expect(isValidHexColor('#FF5733')).toBe(true);
        expect(isValidHexColor('#abcdef')).toBe(true);
        expect(isValidHexColor('#FF573380')).toBe(true);
    });

    it('rejects values without leading hash or with invalid length', () => {
        // Arrange / Act / Assert
        expect(isValidHexColor('abc123')).toBe(false);
        expect(isValidHexColor('#GGG')).toBe(false);
        expect(isValidHexColor('rgb(0,0,0)')).toBe(false);
        expect(isValidHexColor('')).toBe(false);
    });
});

describe('expandShortHex', () => {
    it('expands #abc to #aabbcc and leaves other inputs untouched', () => {
        // Arrange / Act / Assert
        expect(expandShortHex('#abc')).toBe('#aabbcc');
        expect(expandShortHex('#AABBCC')).toBe('#AABBCC');
        expect(expandShortHex('not-a-color')).toBe('not-a-color');
    });
});

describe('hexToRgb and rgbToHex round-trip', () => {
    it('converts hex to rgb and back without losing information', () => {
        // Arrange
        const cases = ['#FF5733', '#000000', '#FFFFFF', '#abcdef'];

        // Act / Assert
        for (const hex of cases) {
            const rgb = hexToRgb(hex);
            expect(rgb).not.toBeNull();
            expect(rgbToHex(rgb!)).toBe(hex.toUpperCase());
        }
    });

    it('returns null when input is not a valid hex', () => {
        // Arrange / Act / Assert
        expect(hexToRgb('not-a-color')).toBeNull();
        expect(hexToRgb('#zz')).toBeNull();
    });
});

describe('parseRgbString', () => {
    it('parses rgb() and rgba() strings, returning numeric components', () => {
        // Arrange / Act / Assert
        expect(parseRgbString('rgb(255, 100, 0)')).toEqual({ r: 255, g: 100, b: 0, a: 1 });
        expect(parseRgbString('rgba(0, 0, 0, 0.25)')).toEqual({ r: 0, g: 0, b: 0, a: 0.25 });
    });

    it('returns null when format is unexpected', () => {
        // Arrange / Act / Assert
        expect(parseRgbString('hsl(0, 0%, 0%)')).toBeNull();
        expect(parseRgbString('garbage')).toBeNull();
    });
});

describe('formatRgb', () => {
    it('chooses rgb or rgba syntax depending on alpha', () => {
        // Arrange / Act / Assert
        expect(formatRgb({ r: 255, g: 0, b: 0, a: 1 })).toBe('rgb(255, 0, 0)');
        expect(formatRgb({ r: 255, g: 0, b: 0, a: 0.5 })).toBe('rgba(255, 0, 0, 0.5)');
    });
});

describe('cssColorToHex / cssColorToRgbString', () => {
    it('translates common CSS color strings to hex', () => {
        // Arrange / Act / Assert
        expect(cssColorToHex('rgb(255, 87, 51)')).toBe('#FF5733');
        expect(cssColorToHex('#abc')).toBe('#AABBCC');
        expect(cssColorToHex('transparent')).toBeNull();
        expect(cssColorToHex('')).toBeNull();
    });

    it('translates hex to a canonical rgb string', () => {
        // Arrange / Act / Assert
        expect(cssColorToRgbString('#FF0000')).toBe('rgb(255, 0, 0)');
        expect(cssColorToRgbString('rgba(0, 0, 0, 0)')).toBeNull();
    });
});

describe('isLightColor', () => {
    it('classifies high-luminance colors as light', () => {
        // Arrange / Act / Assert
        expect(isLightColor({ r: 255, g: 255, b: 255, a: 1 })).toBe(true);
        expect(isLightColor({ r: 0, g: 0, b: 0, a: 1 })).toBe(false);
    });
});
