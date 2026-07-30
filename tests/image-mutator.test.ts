import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyPlaceholder,
  isPatched,
  restoreImage,
} from '@content/tools/fix-broken-images/image-mutator';

/**
 * Reversibility tests for the in-place mutation (RF-CORE-3). happy-dom gives us real elements so we
 * can assert that deactivation restores the original attributes byte-for-byte.
 */
describe('image mutator reversibility', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('swaps src for an SVG placeholder and flags the image as patched', () => {
    // Arrange.
    const image = document.createElement('img');
    image.setAttribute('src', 'https://example.com/missing.png');
    document.body.appendChild(image);

    // Act.
    applyPlaceholder(image);

    // Assert.
    expect(isPatched(image)).toBe(true);
    expect(image.getAttribute('src')?.startsWith('data:image/svg+xml')).toBe(true);
  });

  it('restores the original src and clears all Pixly attributes on revert', () => {
    // Arrange.
    const originalSrc = 'https://example.com/missing.png';
    const image = document.createElement('img');
    image.setAttribute('src', originalSrc);
    document.body.appendChild(image);

    // Act.
    applyPlaceholder(image);
    restoreImage(image);

    // Assert.
    expect(image.getAttribute('src')).toBe(originalSrc);
    expect(isPatched(image)).toBe(false);
    expect(image.outerHTML).toBe(`<img src="${originalSrc}">`);
  });

  it('neutralizes srcset and restores it on revert', () => {
    // Arrange.
    const image = document.createElement('img');
    image.setAttribute('src', 'a.png');
    image.setAttribute('srcset', 'a-2x.png 2x');
    document.body.appendChild(image);

    // Act.
    applyPlaceholder(image);
    const patchedHasSrcset = image.hasAttribute('srcset');
    restoreImage(image);

    // Assert.
    expect(patchedHasSrcset).toBe(false);
    expect(image.getAttribute('srcset')).toBe('a-2x.png 2x');
  });

  it('disables and restores <picture><source> candidates', () => {
    // Arrange.
    const picture = document.createElement('picture');
    const source = document.createElement('source');
    source.setAttribute('srcset', 'big.webp');
    const image = document.createElement('img');
    image.setAttribute('src', 'fallback.png');
    picture.append(source, image);
    document.body.appendChild(picture);

    // Act.
    applyPlaceholder(image);
    const sourceDisabledDuringPatch = source.hasAttribute('srcset');
    restoreImage(image);

    // Assert.
    expect(sourceDisabledDuringPatch).toBe(false);
    expect(source.getAttribute('srcset')).toBe('big.webp');
  });

  it('is idempotent: applying twice does not double-stash', () => {
    // Arrange.
    const image = document.createElement('img');
    image.setAttribute('src', 'a.png');
    document.body.appendChild(image);

    // Act.
    applyPlaceholder(image);
    const firstSrc = image.getAttribute('src');
    applyPlaceholder(image);

    // Assert.
    expect(image.getAttribute('src')).toBe(firstSrc);
  });
});
