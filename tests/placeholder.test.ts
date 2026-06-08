import { describe, expect, it } from 'vitest';
import {
  buildPlaceholderDataUri,
  buildPlaceholderSvg,
  escapeXml,
  formatDimensions,
} from '@content/tools/fix-broken-images/placeholder';

describe('placeholder geometry', () => {
  it('renders an SVG sized to the original rendered box', () => {
    // Arrange.
    const input = { width: 320, height: 240, alt: 'Hero', brokenSrc: 'a.png' };

    // Act.
    const svg = buildPlaceholderSvg(input);

    // Assert.
    expect(svg).toContain('width="320"');
    expect(svg).toContain('height="240"');
    expect(svg).toContain('viewBox="0 0 320 240"');
  });

  it('includes the dimension label when the box is large enough', () => {
    // Arrange.
    const input = { width: 200, height: 150, alt: null, brokenSrc: null };

    // Act.
    const svg = buildPlaceholderSvg(input);

    // Assert.
    expect(svg).toContain('200 × 150');
  });

  it('omits the dimension label for tiny boxes', () => {
    // Arrange.
    const input = { width: 20, height: 20, alt: 'x', brokenSrc: null };

    // Act.
    const svg = buildPlaceholderSvg(input);

    // Assert.
    expect(svg).not.toContain('20 × 20');
  });

  it('shows the alt text only when there is room for it', () => {
    // Arrange.
    const largeBox = { width: 300, height: 200, alt: 'Product photo', brokenSrc: null };
    const mediumBox = { width: 60, height: 60, alt: 'Product photo', brokenSrc: null };

    // Act.
    const largeSvg = buildPlaceholderSvg(largeBox);
    const mediumSvg = buildPlaceholderSvg(mediumBox);

    // Assert.
    expect(largeSvg).toContain('Product photo');
    expect(mediumSvg).not.toContain('Product photo');
  });

  it('escapes characters that would break the SVG markup', () => {
    // Arrange.
    const hostile = '<script>&"\'';

    // Act.
    const escaped = escapeXml(hostile);

    // Assert.
    expect(escaped).toBe('&lt;script&gt;&amp;&quot;&apos;');
  });

  it('does not leak an unescaped alt into the SVG', () => {
    // Arrange.
    const input = { width: 300, height: 200, alt: '<b>x</b>', brokenSrc: null };

    // Act.
    const svg = buildPlaceholderSvg(input);

    // Assert.
    expect(svg).not.toContain('<b>x</b>');
    expect(svg).toContain('&lt;b&gt;x&lt;/b&gt;');
  });

  it('rounds fractional dimensions when formatting', () => {
    // Arrange / Act.
    const label = formatDimensions(199.6, 100.2);

    // Assert.
    expect(label).toBe('200 × 100');
  });

  it('produces a decodable data-URI', () => {
    // Arrange.
    const input = { width: 100, height: 100, alt: null, brokenSrc: null };

    // Act.
    const uri = buildPlaceholderDataUri(input);
    const decoded = decodeURIComponent(uri.replace('data:image/svg+xml;charset=utf-8,', ''));

    // Assert.
    expect(uri.startsWith('data:image/svg+xml')).toBe(true);
    expect(decoded).toContain('<svg');
  });

  it('clamps degenerate zero dimensions to a minimum of 1px', () => {
    // Arrange.
    const input = { width: 0, height: 0, alt: null, brokenSrc: null };

    // Act.
    const svg = buildPlaceholderSvg(input);

    // Assert.
    expect(svg).toContain('width="1"');
    expect(svg).toContain('height="1"');
  });
});
