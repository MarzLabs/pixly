/**
 * Design tokens shared by the popup and the in-page Shadow DOM UI.
 * Replicated as CSS custom properties so both contexts stay visually consistent.
 */
export const DESIGN_TOKENS = {
  colorBrand: '#F97316',
  colorBrandHover: '#EA6A0E',
  colorSurface: '#1E1E22',
  colorSurfaceRaised: '#27272E',
  colorBorder: '#3A3A44',
  colorText: '#F4F4F5',
  colorTextMuted: '#A1A1AA',
  colorDanger: '#EF4444',
  colorSuccess: '#22C55E',
  radiusSmall: '6px',
  radiusMedium: '10px',
  spacingXs: '4px',
  spacingSm: '8px',
  spacingMd: '12px',
  spacingLg: '16px',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  fontSizeSm: '12px',
  fontSizeMd: '13px',
  fontSizeLg: '15px',
} as const;

/**
 * Emits the tokens as a `--pixly-*` CSS variable block usable inside `:host` or `:root`.
 */
export function tokensToCssVariables(): string {
  return Object.entries(DESIGN_TOKENS)
    .map(([key, value]) => {
      const cssName = key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

      return `--pixly-${cssName}: ${value};`;
    })
    .join('\n  ');
}
