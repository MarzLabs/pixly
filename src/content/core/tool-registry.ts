import type { ToolId } from '@shared/constants';
import type { Tool } from './tool';

/**
 * Central registry that drives the entire UI. The popup lists everything registered here, and the
 * in-page toolbar renders controls for whichever registered tools are active. Adding a tool is a
 * single `register()` call — no other module needs to change (RF-CORE-1).
 *
 * Implemented as a plain class with no chrome dependencies so it is trivially unit-testable.
 */
export class ToolRegistry {
  private readonly tools = new Map<ToolId, Tool>();

  /** Registers a tool. Throws on duplicate ids to surface wiring mistakes early. */
  register(tool: Tool): void {
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool already registered: ${tool.id}`);
    }

    this.tools.set(tool.id, tool);
  }

  get(id: ToolId): Tool | undefined {
    return this.tools.get(id);
  }

  has(id: ToolId): boolean {
    return this.tools.has(id);
  }

  /** All registered tools, in registration order (drives popup ordering). */
  list(): Tool[] {
    return [...this.tools.values()];
  }

  get size(): number {
    return this.tools.size;
  }
}
