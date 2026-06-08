import { describe, expect, it } from 'vitest';
import type { ComponentChildren } from 'preact';
import { ToolRegistry } from '@content/core/tool-registry';
import type { Tool, ToolContext } from '@content/core/tool';
import type { ToolScope } from '@shared/types';

/**
 * A fictional tool used to prove the registry is extensible without touching existing tools or the
 * core (RF-CORE-1): registering it makes it discoverable through the same list() the UI consumes.
 */
function makeFakeTool(id: string, scope: ToolScope = 'origin'): Tool {
  return {
    // The registry treats ids opaquely; cast keeps the fake decoupled from the real ToolId union.
    id: id as Tool['id'],
    name: `Fake ${id}`,
    description: 'A test-only tool.',
    icon: '<svg/>',
    scope,
    defaultState: () => ({ minSizePx: 8 }),
    activate: (_context: ToolContext) => undefined,
    deactivate: () => undefined,
    renderControls: (): ComponentChildren => null,
    serializeState: () => ({ minSizePx: 8 }),
    restoreState: () => undefined,
  } as unknown as Tool;
}

describe('ToolRegistry', () => {
  it('registers and lists tools in registration order', () => {
    // Arrange.
    const registry = new ToolRegistry();

    // Act.
    registry.register(makeFakeTool('alpha'));
    registry.register(makeFakeTool('beta'));

    // Assert.
    expect(registry.list().map((tool) => tool.id)).toEqual(['alpha', 'beta']);
    expect(registry.size).toBe(2);
  });

  it('exposes a registered tool by id', () => {
    // Arrange.
    const registry = new ToolRegistry();
    const tool = makeFakeTool('gamma');

    // Act.
    registry.register(tool);

    // Assert.
    expect(registry.get('gamma' as Tool['id'])).toBe(tool);
    expect(registry.has('gamma' as Tool['id'])).toBe(true);
  });

  it('makes a brand-new tool discoverable through the same list the UI uses (RF-CORE-1)', () => {
    // Arrange.
    const registry = new ToolRegistry();
    registry.register(makeFakeTool('measure', 'url'));

    // Act.
    const names = registry.list().map((tool) => tool.name);

    // Assert.
    expect(names).toContain('Fake measure');
  });

  it('rejects duplicate registrations to surface wiring mistakes', () => {
    // Arrange.
    const registry = new ToolRegistry();
    registry.register(makeFakeTool('dup'));

    // Act / Assert.
    expect(() => registry.register(makeFakeTool('dup'))).toThrow(/already registered/);
  });
});
