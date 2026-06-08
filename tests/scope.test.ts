import { describe, expect, it } from 'vitest';
import { deriveScopeKey, isSameScope } from '@shared/lib/scope';

describe('deriveScopeKey', () => {
  it('returns scheme://host:port for origin scope, ignoring the path', () => {
    // Arrange.
    const href = 'https://example.com:8443/products/42?ref=home#reviews';

    // Act.
    const key = deriveScopeKey(href, 'origin');

    // Assert.
    expect(key).toBe('https://example.com:8443');
  });

  it('returns origin + path + search for url scope, dropping the hash', () => {
    // Arrange.
    const href = 'https://example.com/products/42?ref=home#reviews';

    // Act.
    const key = deriveScopeKey(href, 'url');

    // Assert.
    expect(key).toBe('https://example.com/products/42?ref=home');
  });

  it('normalizes an empty path to "/" for url scope', () => {
    // Arrange.
    const href = 'https://example.com';

    // Act.
    const key = deriveScopeKey(href, 'url');

    // Assert.
    expect(key).toBe('https://example.com/');
  });

  it('treats two paths of the same origin as the same origin scope', () => {
    // Arrange.
    const pageA = 'https://example.com/a';
    const pageB = 'https://example.com/b';

    // Act / Assert.
    expect(isSameScope(pageA, pageB, 'origin')).toBe(true);
    expect(isSameScope(pageA, pageB, 'url')).toBe(false);
  });

  it('considers hash-only differences the same url scope (SPA anchor change)', () => {
    // Arrange.
    const pageA = 'https://example.com/app#one';
    const pageB = 'https://example.com/app#two';

    // Act / Assert.
    expect(isSameScope(pageA, pageB, 'url')).toBe(true);
  });
});
