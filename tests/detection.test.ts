import { describe, expect, it } from 'vitest';
import {
  classifyImage,
  DEFAULT_MIN_SIZE_PX,
  isBroken,
  type ImageProbe,
} from '@content/tools/fix-broken-images/detection';

/** Builds a probe with sensible defaults, overridable per case. */
function probe(overrides: Partial<ImageProbe> = {}): ImageProbe {
  return {
    complete: true,
    naturalWidth: 100,
    naturalHeight: 100,
    erroredOnLoad: false,
    renderedWidth: 100,
    renderedHeight: 100,
    currentSrc: 'https://example.com/photo.png',
    ...overrides,
  };
}

describe('classifyImage', () => {
  it('flags an image that fired an error as broken', () => {
    // Arrange.
    const input = probe({ erroredOnLoad: true, naturalWidth: 0, naturalHeight: 0 });

    // Act.
    const status = classifyImage(input, DEFAULT_MIN_SIZE_PX);

    // Assert.
    expect(status).toBe('broken');
  });

  it('flags a complete image with zero natural size as broken', () => {
    // Arrange.
    const input = probe({ complete: true, naturalWidth: 0, naturalHeight: 0 });

    // Act.
    const status = classifyImage(input, DEFAULT_MIN_SIZE_PX);

    // Assert.
    expect(status).toBe('broken');
  });

  it('treats a still-loading image as pending, not broken', () => {
    // Arrange.
    const input = probe({ complete: false, naturalWidth: 0, naturalHeight: 0 });

    // Act.
    const status = classifyImage(input, DEFAULT_MIN_SIZE_PX);

    // Assert.
    expect(status).toBe('pending');
  });

  it('considers a normally-loaded image ok', () => {
    // Arrange.
    const input = probe({ naturalWidth: 640, naturalHeight: 480 });

    // Act.
    const status = classifyImage(input, DEFAULT_MIN_SIZE_PX);

    // Assert.
    expect(status).toBe('ok');
  });

  it('ignores a broken image smaller than the minimum size (tracking pixel)', () => {
    // Arrange.
    const input = probe({
      erroredOnLoad: true,
      naturalWidth: 0,
      naturalHeight: 0,
      renderedWidth: 1,
      renderedHeight: 1,
    });

    // Act.
    const status = classifyImage(input, DEFAULT_MIN_SIZE_PX);

    // Assert.
    expect(status).toBe('ignored');
  });

  it('ignores a complete image with no rendered box (hidden by CSS)', () => {
    // Arrange.
    const input = probe({ renderedWidth: 0, renderedHeight: 0, naturalWidth: 0, naturalHeight: 0 });

    // Act.
    const status = classifyImage(input, DEFAULT_MIN_SIZE_PX);

    // Assert.
    expect(status).toBe('ignored');
  });

  it('treats an image with no source as ok (nothing to fix)', () => {
    // Arrange.
    const input = probe({ currentSrc: '', naturalWidth: 0, naturalHeight: 0 });

    // Act.
    const status = classifyImage(input, DEFAULT_MIN_SIZE_PX);

    // Assert.
    expect(status).toBe('ok');
  });

  it('still flags a broken image larger than the threshold even via srcset currentSrc', () => {
    // Arrange.
    const input = probe({
      erroredOnLoad: true,
      naturalWidth: 0,
      naturalHeight: 0,
      currentSrc: 'https://cdn.example.com/img-800w.jpg',
      renderedWidth: 320,
      renderedHeight: 240,
    });

    // Act / Assert.
    expect(isBroken(input, DEFAULT_MIN_SIZE_PX)).toBe(true);
  });
});
