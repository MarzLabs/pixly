import { PIXLY_DATA_PREFIX } from '@shared/constants';
import { buildPlaceholderDataUri } from './placeholder';

/**
 * Performs the reversible in-place mutation of a broken `<img>` (spec §6.3). Before changing
 * anything, the original attributes are stashed in `data-pixly-*` attributes so deactivation can
 * restore the element byte-for-byte (RF-CORE-3). Re-applying to an already-patched image is a no-op.
 */

const ORIGINAL_SRC_ATTR = `${PIXLY_DATA_PREFIX}original-src`;
const ORIGINAL_SRCSET_ATTR = `${PIXLY_DATA_PREFIX}original-srcset`;
const ORIGINAL_SIZES_ATTR = `${PIXLY_DATA_PREFIX}original-sizes`;
const PATCHED_FLAG_ATTR = `${PIXLY_DATA_PREFIX}patched`;
const SOURCE_DISABLED_ATTR = `${PIXLY_DATA_PREFIX}source-disabled`;

/** True when this image currently shows a Pixly placeholder. */
export function isPatched(image: HTMLImageElement): boolean {
  return image.hasAttribute(PATCHED_FLAG_ATTR);
}

/**
 * Swaps the image's source for an SVG placeholder sized to its current rendered box, neutralizing
 * any responsive sources so the broken URL cannot reassert itself.
 */
export function applyPlaceholder(image: HTMLImageElement): void {
  if (isPatched(image)) {
    return;
  }

  const rect = image.getBoundingClientRect();

  stashOriginalAttributes(image);
  neutralizeResponsiveSources(image);

  const dataUri = buildPlaceholderDataUri({
    width: rect.width,
    height: rect.height,
    alt: image.getAttribute('alt'),
    brokenSrc: image.getAttribute(ORIGINAL_SRC_ATTR),
  });

  // Removing srcset before setting src guarantees the browser uses our placeholder, not a candidate.
  image.removeAttribute('srcset');
  image.removeAttribute('sizes');
  image.src = dataUri;

  image.setAttribute(PATCHED_FLAG_ATTR, 'true');
}

/** Restores the original attributes and re-enables responsive sources (full reversal). */
export function restoreImage(image: HTMLImageElement): void {
  if (!isPatched(image)) {
    return;
  }

  const originalSrc = image.getAttribute(ORIGINAL_SRC_ATTR);
  const originalSrcset = image.getAttribute(ORIGINAL_SRCSET_ATTR);
  const originalSizes = image.getAttribute(ORIGINAL_SIZES_ATTR);

  restoreResponsiveSources(image);

  if (originalSrcset !== null) {
    image.setAttribute('srcset', originalSrcset);
  }

  if (originalSizes !== null) {
    image.setAttribute('sizes', originalSizes);
  }

  // Setting src last triggers a fresh load attempt of the real (possibly now-fixed) resource.
  if (originalSrc !== null) {
    image.setAttribute('src', originalSrc);
  } else {
    image.removeAttribute('src');
  }

  image.removeAttribute(ORIGINAL_SRC_ATTR);
  image.removeAttribute(ORIGINAL_SRCSET_ATTR);
  image.removeAttribute(ORIGINAL_SIZES_ATTR);
  image.removeAttribute(PATCHED_FLAG_ATTR);
}

function stashOriginalAttributes(image: HTMLImageElement): void {
  image.setAttribute(ORIGINAL_SRC_ATTR, image.getAttribute('src') ?? '');

  const srcset = image.getAttribute('srcset');
  if (srcset !== null) {
    image.setAttribute(ORIGINAL_SRCSET_ATTR, srcset);
  }

  const sizes = image.getAttribute('sizes');
  if (sizes !== null) {
    image.setAttribute(ORIGINAL_SIZES_ATTR, sizes);
  }
}

/**
 * Disables any sibling `<source>` candidates of a `<picture>` parent so the browser cannot pick a
 * responsive source over our placeholder. Originals are stashed for restoration.
 */
function neutralizeResponsiveSources(image: HTMLImageElement): void {
  const picture = image.closest('picture');

  if (!picture) {
    return;
  }

  for (const source of Array.from(picture.querySelectorAll('source'))) {
    if (source.hasAttribute(SOURCE_DISABLED_ATTR)) {
      continue;
    }

    source.setAttribute(SOURCE_DISABLED_ATTR, source.getAttribute('srcset') ?? '');
    source.removeAttribute('srcset');
  }
}

function restoreResponsiveSources(image: HTMLImageElement): void {
  const picture = image.closest('picture');

  if (!picture) {
    return;
  }

  for (const source of Array.from(picture.querySelectorAll('source'))) {
    if (!source.hasAttribute(SOURCE_DISABLED_ATTR)) {
      continue;
    }

    const original = source.getAttribute(SOURCE_DISABLED_ATTR) ?? '';

    if (original.length > 0) {
      source.setAttribute('srcset', original);
    }

    source.removeAttribute(SOURCE_DISABLED_ATTR);
  }
}
