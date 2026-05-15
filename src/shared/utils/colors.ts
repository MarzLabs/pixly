// Color parsing and conversion utilities. Pure functions — tested separately.

const HEX_RADIX = 16;
const RGB_MAX = 255;
const HEX_COMPONENT_PAD = 2;
const SHORT_HEX_REGEX = /^#[0-9a-f]{3}$/i;
const LONG_HEX_REGEX = /^#[0-9a-f]{6}$/i;
const LONG_HEX_WITH_ALPHA_REGEX = /^#[0-9a-f]{8}$/i;
const RGB_REGEX = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*(\d*\.?\d+))?\s*\)$/i;

export interface RgbColor {
    r: number;
    g: number;
    b: number;
    a: number;
}

export function isValidHexColor(value: string): boolean {
    return SHORT_HEX_REGEX.test(value) || LONG_HEX_REGEX.test(value) || LONG_HEX_WITH_ALPHA_REGEX.test(value);
}

export function expandShortHex(hex: string): string {
    if (!SHORT_HEX_REGEX.test(hex)) {
        return hex;
    }

    const [, r, g, b] = hex;

    return `#${r}${r}${g}${g}${b}${b}`;
}

export function hexToRgb(hex: string): RgbColor | null {
    if (!isValidHexColor(hex)) {
        return null;
    }

    const expanded = expandShortHex(hex);
    const r = parseInt(expanded.slice(1, 3), HEX_RADIX);
    const g = parseInt(expanded.slice(3, 5), HEX_RADIX);
    const b = parseInt(expanded.slice(5, 7), HEX_RADIX);
    const a = expanded.length === 9 ? parseInt(expanded.slice(7, 9), HEX_RADIX) / RGB_MAX : 1;

    return { r, g, b, a };
}

export function rgbToHex(color: RgbColor): string {
    const componentToHex = (n: number): string => {
        const clamped = Math.max(0, Math.min(RGB_MAX, Math.round(n)));

        return clamped.toString(HEX_RADIX).padStart(HEX_COMPONENT_PAD, '0');
    };

    return `#${componentToHex(color.r)}${componentToHex(color.g)}${componentToHex(color.b)}`.toUpperCase();
}

export function parseRgbString(value: string): RgbColor | null {
    const match = value.match(RGB_REGEX);

    if (!match) {
        return null;
    }

    const [, r, g, b, a] = match;

    return {
        r: parseInt(r, 10),
        g: parseInt(g, 10),
        b: parseInt(b, 10),
        a: a !== undefined ? parseFloat(a) : 1,
    };
}

export function formatRgb(color: RgbColor): string {
    if (color.a < 1) {
        return `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})`;
    }

    return `rgb(${color.r}, ${color.g}, ${color.b})`;
}

export function cssColorToHex(value: string): string | null {
    if (!value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)') {
        return null;
    }

    if (isValidHexColor(value)) {
        return rgbToHex(hexToRgb(value)!);
    }

    const rgb = parseRgbString(value);

    if (rgb) {
        return rgbToHex(rgb);
    }

    return null;
}

export function cssColorToRgbString(value: string): string | null {
    if (!value || value === 'transparent' || value === 'rgba(0, 0, 0, 0)') {
        return null;
    }

    if (isValidHexColor(value)) {
        const rgb = hexToRgb(value)!;

        return formatRgb(rgb);
    }

    const rgb = parseRgbString(value);

    return rgb ? formatRgb(rgb) : null;
}

// Quick perceived brightness check — used to pick readable text color.
export function isLightColor(color: RgbColor): boolean {
    const RED_WEIGHT = 0.299;
    const GREEN_WEIGHT = 0.587;
    const BLUE_WEIGHT = 0.114;
    const LIGHTNESS_THRESHOLD = 160;

    const brightness = color.r * RED_WEIGHT + color.g * GREEN_WEIGHT + color.b * BLUE_WEIGHT;

    return brightness > LIGHTNESS_THRESHOLD;
}
