import type { ToolId } from '@shared/constants';
import type { PixlyConfig } from '@shared/types';
import { deriveScopeKey } from '@shared/lib/scope';
import {
  activateTool as activateInConfig,
  deactivateTool as deactivateInConfig,
  getActiveToolIds,
  getToolState,
  setGlobalEnabled,
  updateToolState,
} from '@shared/persistence/config-document';
import { loadConfig, onConfigChanged, saveConfig } from '@shared/persistence/config-store';
import type { ContentToPopupReply, PageContext, PopupToContentMessage } from '@shared/messaging/messages';
import { createRegistry } from './core/create-registry';
import type { Tool, ToolContext } from './core/tool';
import type { ToolRegistry } from './core/tool-registry';
import { ShadowHost } from './ui/shadow-host';
import { ToolbarMount } from './ui/toolbar-mount';
import { ImageOverlayTool } from './tools/image-overlay/image-overlay-tool';
import { extractImageFile } from './tools/image-overlay/image-loader';

/**
 * The content-script orchestrator (spec §4.3). Owns the registry, the Shadow DOM host and the
 * toolbar, and reconciles the page's live tools against the persisted config for the current scope.
 *
 * Re-applying active tools on load is what makes them survive full reloads (RF-ACT-2/4). It reacts
 * to cross-context config changes (popup toggles) via chrome.storage.onChanged.
 */
export class Orchestrator {
  private readonly shadowHost = new ShadowHost();
  private readonly registry: ToolRegistry;
  private toolbar: ToolbarMount | null = null;
  private config: PixlyConfig = { globalEnabled: true, scopes: {} };
  /** Tools currently activated on this page, by id. */
  private readonly liveTools = new Map<ToolId, Tool>();
  private currentHref = location.href;

  constructor() {
    this.registry = createRegistry(() => this.buildContext(this.activeContextToolId));
  }

  async start(): Promise<void> {
    this.config = await loadConfig();

    onConfigChanged((config) => {
      this.config = config;
      void this.reconcile();
    });

    this.installNavigationWatcher();
    this.installPasteForwarder();
    this.installMessageListener();

    await this.reconcile();
  }

  /** Reconciles live tools with what the config says should be active for the current scope. */
  private async reconcile(): Promise<void> {
    if (!this.config.globalEnabled) {
      this.teardownAll();
      this.shadowHost.unmount();

      return;
    }

    const root = this.shadowHost.mount();
    this.toolbar ??= new ToolbarMount(this.shadowHost.layer);

    const desired = new Set<ToolId>(this.collectActiveToolIdsForPage());

    // Deactivate tools no longer desired for this page/scope.
    for (const [toolId, tool] of this.liveTools) {
      if (!desired.has(toolId)) {
        tool.deactivate();
        this.liveTools.delete(toolId);
      }
    }

    // Activate newly desired tools, restoring their persisted state.
    for (const toolId of desired) {
      if (this.liveTools.has(toolId)) {
        continue;
      }

      const tool = this.registry.get(toolId);

      if (!tool) {
        continue;
      }

      const scopeKey = deriveScopeKey(this.currentHref, tool.scope);
      const persisted = getToolState(this.config, scopeKey, toolId as never);
      const state = persisted ?? tool.defaultState();

      this.activeContextToolId = toolId;
      tool.activate(this.buildContext(toolId), state as never);
      this.liveTools.set(toolId, tool);
    }

    void root;
    this.toolbar.sync([...this.liveTools.values()]);
  }

  /** Active tool ids that apply to the current page across both scope kinds. */
  private collectActiveToolIdsForPage(): ToolId[] {
    const ids = new Set<ToolId>();

    for (const tool of this.registry.list()) {
      const scopeKey = deriveScopeKey(this.currentHref, tool.scope);

      if (getActiveToolIds(this.config, scopeKey).includes(tool.id)) {
        ids.add(tool.id);
      }
    }

    return [...ids];
  }

  /** The tool id currently being (de)activated, so persistState() targets the right tool. */
  private activeContextToolId: ToolId | null = null;

  private buildContext(toolId: ToolId | null): ToolContext {
    return {
      shadowRoot: this.shadowHost.mount(),
      href: this.currentHref,
      persistState: () => {
        if (toolId) {
          void this.persistToolState(toolId);
        }
      },
      requestControlsRefresh: () => {
        this.toolbar?.refresh([...this.liveTools.values()]);
      },
    };
  }

  private async persistToolState(toolId: ToolId): Promise<void> {
    const tool = this.liveTools.get(toolId);

    if (!tool) {
      return;
    }

    const scopeKey = deriveScopeKey(this.currentHref, tool.scope);
    this.config = updateToolState(this.config, scopeKey, toolId as never, tool.serializeState() as never);

    await saveConfig(this.config);
  }

  /** Toggles a tool for the current page (called from popup messages). */
  async toggleTool(toolId: ToolId, enabled: boolean): Promise<void> {
    const tool = this.registry.get(toolId);

    if (!tool) {
      return;
    }

    const scopeKey = deriveScopeKey(this.currentHref, tool.scope);

    this.config = enabled
      ? activateInConfig(this.config, scopeKey, toolId as never, tool.defaultState() as never)
      : deactivateInConfig(this.config, scopeKey, toolId);

    await saveConfig(this.config);
    await this.reconcile();
  }

  async setGlobal(enabled: boolean): Promise<void> {
    this.config = setGlobalEnabled(this.config, enabled);
    await saveConfig(this.config);
    await this.reconcile();
  }

  private teardownAll(): void {
    for (const tool of this.liveTools.values()) {
      tool.deactivate();
    }

    this.liveTools.clear();
    this.toolbar?.sync([]);
  }

  /** Treats SPA route changes as navigation (RF-ACT-5): url-scoped tools are re-evaluated. */
  private installNavigationWatcher(): void {
    const onNavigate = (): void => {
      if (location.href === this.currentHref) {
        return;
      }

      this.currentHref = location.href;
      void this.reconcile();
    };

    window.addEventListener('popstate', onNavigate);

    // Patch pushState/replaceState so client-side routing also triggers reconciliation.
    for (const method of ['pushState', 'replaceState'] as const) {
      const original = history[method].bind(history);

      history[method] = (...args: Parameters<History['pushState']>) => {
        original(...args);
        onNavigate();
      };
    }
  }

  /** Forwards window-level paste of an image to an active Image Overlay tool (spec §7.2). */
  private installPasteForwarder(): void {
    window.addEventListener('paste', (event) => {
      const overlay = this.liveTools.get('image-overlay');

      if (!(overlay instanceof ImageOverlayTool)) {
        return;
      }

      const file = extractImageFile(event.clipboardData);

      if (file) {
        overlay.handlePastedFile(file);
      }
    });
  }

  private installMessageListener(): void {
    chrome.runtime.onMessage.addListener(
      (message: PopupToContentMessage, _sender, sendResponse: (reply: ContentToPopupReply) => void) => {
        void this.handleMessage(message).then(sendResponse);

        // Returning true keeps the message channel open for the async reply.
        return true;
      },
    );
  }

  private async handleMessage(message: PopupToContentMessage): Promise<ContentToPopupReply> {
    switch (message.type) {
      case 'pixly/request-page-context':
        return { type: 'pixly/page-context', context: this.buildPageContext() };
      case 'pixly/toggle-tool':
        await this.toggleTool(message.toolId, message.enabled);

        return { type: 'pixly/ack' };
      case 'pixly/set-global-enabled':
        await this.setGlobal(message.enabled);

        return { type: 'pixly/ack' };
    }
  }

  private buildPageContext(): PageContext {
    return {
      href: this.currentHref,
      originScopeKey: deriveScopeKey(this.currentHref, 'origin'),
      urlScopeKey: deriveScopeKey(this.currentHref, 'url'),
      activeToolIds: this.collectActiveToolIdsForPage(),
      globalEnabled: this.config.globalEnabled,
    };
  }
}
