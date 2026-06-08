import type { ToolScope } from '@shared/types';

/**
 * Derives the persistence key for a tool given the current location and the tool's scope.
 *
 * - `origin` → `scheme://host:port` (applies to every path of the origin). Spec §5.1.
 * - `url`    → full URL without the hash (a specific page/route).
 *
 * The hash is always dropped: SPA route changes that only mutate the hash are not treated
 * as navigation for persistence, and design overlays should not be split per anchor.
 */
export function deriveScopeKey(href: string, scope: ToolScope): string {
  const url = new URL(href);

  if (scope === 'origin') {
    return url.origin;
  }

  // url scope: origin + pathname + search, no hash, no trailing-slash ambiguity.
  const normalizedPath = url.pathname === '' ? '/' : url.pathname;

  return `${url.origin}${normalizedPath}${url.search}`;
}

/**
 * Two URLs belong to the same `url` scope when their scope keys match. Used by the SPA
 * navigation handler to decide whether a stored overlay still applies after a route change.
 */
export function isSameScope(hrefA: string, hrefB: string, scope: ToolScope): boolean {
  return deriveScopeKey(hrefA, scope) === deriveScopeKey(hrefB, scope);
}
