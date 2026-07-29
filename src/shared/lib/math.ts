/** Numeric helpers shared across features (overlay geometry, toolbar positioning). */

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
