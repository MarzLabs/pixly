// Design tokens: centralized palette, typography, spacing and motion values.
// Every UI surface in Pixly (popup, content layer, inspector panel) should
// consume these to keep a coherent look inspired by Linear, Figma and Vercel.

export const ColorToken = {
    // Neutral grays form the base palette.
    Gray50: '#FAFAFA',
    Gray100: '#F4F4F5',
    Gray200: '#E4E4E7',
    Gray300: '#D4D4D8',
    Gray400: '#A1A1AA',
    Gray500: '#71717A',
    Gray600: '#52525B',
    Gray700: '#3F3F46',
    Gray800: '#27272A',
    Gray900: '#18181B',
    Gray950: '#09090B',

    // Single accent color used for primary actions, selections and active states.
    Accent: '#5B5BF7',
    AccentHover: '#4F4FE0',
    AccentSubtle: 'rgba(91, 91, 247, 0.10)',
    AccentBorder: 'rgba(91, 91, 247, 0.40)',

    // Pinned-element accent (distinct from the primary accent so the user can
    // immediately tell what's pinned vs. what's just hovered).
    Pinned: '#F59E0B',
    PinnedSubtle: 'rgba(245, 158, 11, 0.10)',

    // Snap indicator color.
    Snap: '#10B981',

    // Auto-guides (the four lines that appear when an element is pinned).
    AutoGuide: 'rgba(245, 158, 11, 0.55)',

    // Manual guides drawn by the user.
    ManualGuide: '#FF00FF',

    // Selection (for selected guides).
    Selected: '#5B5BF7',

    // Text and overlays.
    OverlayBackground: 'rgba(24, 24, 27, 0.95)',
    OverlayText: '#F4F4F5',
    OverlayMuted: '#A1A1AA',
    OverlayBorder: 'rgba(255, 255, 255, 0.08)',
} as const;

// System font stack — fastest first paint, native feel.
export const FontStack = {
    Sans: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', 'Geist', Roboto, Helvetica, Arial, sans-serif",
    Mono: "'SF Mono', 'JetBrains Mono', Menlo, Consolas, 'Liberation Mono', monospace",
} as const;

export const FontSize = {
    Xs: '11px',
    Sm: '12px',
    Md: '13px',
    Lg: '14px',
    Xl: '16px',
} as const;

export const FontWeight = {
    Regular: 400,
    Medium: 500,
    Semibold: 600,
    Bold: 700,
} as const;

export const Spacing = {
    Xxs: '2px',
    Xs: '4px',
    Sm: '6px',
    Md: '8px',
    Lg: '12px',
    Xl: '16px',
    Xxl: '24px',
} as const;

export const Radius = {
    Sm: '4px',
    Md: '6px',
    Lg: '8px',
    Xl: '12px',
    Full: '999px',
} as const;

export const Shadow = {
    Sm: '0 1px 2px rgba(0, 0, 0, 0.08)',
    Md: '0 4px 12px rgba(0, 0, 0, 0.12)',
    Lg: '0 8px 24px rgba(0, 0, 0, 0.18)',
    Xl: '0 12px 32px rgba(0, 0, 0, 0.22)',
} as const;

// Motion: short transitions only, never animations that draw attention.
export const Motion = {
    Fast: '120ms',
    Medium: '160ms',
    Slow: '220ms',
    Easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const;

// Z-index bands: each functional layer gets a fixed range so we never have to
// guess which surface sits on top of which.
export const ZIndex = {
    GridOverlay: 2147483600,
    InspectorPanel: 2147483620,
    AutoGuide: 2147483635,
    Highlight: 2147483640,
    ManualGuide: 2147483641,
    DistanceLabel: 2147483642,
    Tooltip: 2147483645,
    ShadowHost: 2147483646,
    Notification: 2147483647,
} as const;
