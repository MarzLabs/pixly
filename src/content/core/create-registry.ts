import { FixBrokenImagesTool } from '@content/tools/fix-broken-images/fix-broken-images-tool';
import { GlobalOutlinesTool } from '@content/tools/global-outlines/global-outlines-tool';
import { ImageOverlayTool } from '@content/tools/image-overlay/image-overlay-tool';
import type { ToolContext } from './tool';
import { ToolRegistry } from './tool-registry';

/**
 * Builds the registry with the v1 tool set. Centralized here so the orchestrator and the popup
 * derive the same tool list, and so adding a future tool is a one-line change (RF-CORE-1).
 *
 * Tools that need the runtime context (shadow root, persistence callback) receive it lazily; the
 * registry only needs their static metadata to render the popup, which has no ToolContext.
 */
export function createRegistry(contextProvider: () => ToolContext): ToolRegistry {
  const registry = new ToolRegistry();

  registry.register(new FixBrokenImagesTool(contextProvider));
  registry.register(new ImageOverlayTool(contextProvider));
  registry.register(new GlobalOutlinesTool(contextProvider));

  return registry;
}
