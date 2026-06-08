import { useEffect, useMemo, useState } from 'preact/hooks';
import { TOOL_CATALOG, type ToolCatalogEntry } from '@shared/constants/tool-catalog';
import type { ToolId } from '@shared/constants';
import type { PixlyConfig } from '@shared/types';
import { deriveScopeKey } from '@shared/lib/scope';
import { isToolActive } from '@shared/persistence/config-document';
import { loadConfig, onConfigChanged } from '@shared/persistence/config-store';
import { sendToTab } from '@shared/messaging/send';

/**
 * Pixly popup (spec §8, RF-UI-2). Lists every tool from the catalog with a per-site toggle plus a
 * global enable switch. The popup never mutates the page directly: it asks the active tab's content
 * script to toggle, which updates storage and reconciles. Config changes stream back via onChanged.
 */
export function PopupApp() {
  const [config, setConfig] = useState<PixlyConfig | null>(null);
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);

  useEffect(() => {
    void initialize();

    const unsubscribe = onConfigChanged(setConfig);

    return unsubscribe;
  }, []);

  async function initialize(): Promise<void> {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    setTab(activeTab ?? null);
    setConfig(await loadConfig());
  }

  const href = tab?.url ?? '';
  const reachable = isReachableUrl(href);

  async function toggleTool(entry: ToolCatalogEntry, enabled: boolean): Promise<void> {
    if (!tab?.id) {
      return;
    }

    await sendToTab(tab.id, { type: 'pixly/toggle-tool', toolId: entry.id, enabled });
  }

  async function toggleGlobal(enabled: boolean): Promise<void> {
    if (!tab?.id) {
      return;
    }

    await sendToTab(tab.id, { type: 'pixly/set-global-enabled', enabled });
  }

  const activeFlags = useMemo(() => computeActiveFlags(config, href), [config, href]);
  const globalEnabled = config?.globalEnabled ?? true;

  return (
    <div>
      <header class="popup-header">
        <span class="popup-title">Pixly</span>
      </header>

      {href && <div class="popup-subtitle">{href}</div>}

      {!reachable && (
        <p class="popup-note">Pixly can't run on this page (browser/internal page).</p>
      )}

      <div class="popup-tools">
        {TOOL_CATALOG.map((entry) => (
          <article key={entry.id} class="tool-card">
            <span class="tool-card__icon" dangerouslySetInnerHTML={{ __html: entry.icon }} />
            <div class="tool-card__text">
              <div class="tool-card__name">
                {entry.name}
                <span class="tool-card__scope">{entry.scope}</span>
              </div>
              <div class="tool-card__desc">{entry.description}</div>
            </div>
            <Switch
              checked={activeFlags[entry.id] ?? false}
              disabled={!reachable || !globalEnabled}
              onChange={(value) => void toggleTool(entry, value)}
            />
          </article>
        ))}
      </div>

      <div class="popup-global">
        <span class="popup-global__label">Pixly enabled</span>
        <Switch
          checked={globalEnabled}
          disabled={!reachable}
          onChange={(value) => void toggleGlobal(value)}
        />
      </div>

      <p class="popup-note">
        Tools stay active on this site across reloads, and only where you turn them on.
      </p>
    </div>
  );
}

interface SwitchProps {
  checked: boolean;
  disabled: boolean;
  onChange: (value: boolean) => void;
}

function Switch({ checked, disabled, onChange }: SwitchProps) {
  return (
    <label class="switch">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange((event.target as HTMLInputElement).checked)}
      />
      <span class="switch__slider" />
    </label>
  );
}

function computeActiveFlags(config: PixlyConfig | null, href: string): Record<ToolId, boolean> {
  const flags = {} as Record<ToolId, boolean>;

  if (!config || !href) {
    return flags;
  }

  for (const entry of TOOL_CATALOG) {
    const scopeKey = deriveScopeKey(href, entry.scope);
    flags[entry.id] = isToolActive(config, scopeKey, entry.id);
  }

  return flags;
}

/** Content scripts cannot run on browser-internal pages, so toggles are disabled there. */
function isReachableUrl(url: string): boolean {
  return /^https?:/.test(url) || url.startsWith('file:');
}
