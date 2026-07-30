import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  TOOL_CATALOG,
  type ToolCatalogEntry,
  type ToolConfigField,
} from '@shared/constants/tool-catalog';
import type { ToolId } from '@shared/constants';
import type { PixlyConfig } from '@shared/types';
import { deriveScopeKey } from '@shared/lib/scope';
import {
  getToolConfigValue,
  isToolActive,
  updateToolConfigValue,
} from '@shared/persistence/config-document';
import { loadConfig, onConfigChanged, saveConfig } from '@shared/persistence/config-store';
import { sendToTab } from '@shared/messaging/send';

/**
 * Pixly popup (spec §8, RF-UI-2). Lists every tool from the catalog with a per-site toggle plus a
 * global enable switch, and hosts the set-and-forget config fields declared in the catalog — live
 * controls stay in the in-page widget. Toggling never mutates the page directly: it asks the active
 * tab's content script, which updates storage and reconciles. Config edits are written straight to
 * storage; the content script picks them up via onChanged and applies them to live tools.
 */
export function PopupApp() {
  const [config, setConfig] = useState<PixlyConfig | null>(null);
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);
  const [tabUnreachable, setTabUnreachable] = useState(false);
  const [openHelpId, setOpenHelpId] = useState<ToolId | null>(null);

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

    // Persistent site access for capture-dependent tools. Must fire synchronously inside the
    // user's click (no awaits before it) or Chrome drops the permission prompt. A denial is not
    // fatal: the tool falls back to activeTab, which the popup interaction just granted anyway.
    if (enabled && entry.needsHostPermission && href) {
      void requestHostPermission(href);
    }

    const reply = await sendToTab(tab.id, { type: 'pixly/toggle-tool', toolId: entry.id, enabled });
    // An unreachable content script (page loaded before Pixly was installed/updated) would
    // swallow toggles silently; surface it so the user knows a refresh fixes it.
    setTabUnreachable(reply.type === 'pixly/error');
  }

  async function toggleGlobal(enabled: boolean): Promise<void> {
    if (!tab?.id) {
      return;
    }

    const reply = await sendToTab(tab.id, { type: 'pixly/set-global-enabled', enabled });
    setTabUnreachable(reply.type === 'pixly/error');
  }

  async function changeConfigValue(
    entry: ToolCatalogEntry,
    field: ToolConfigField,
    rawValue: string,
  ): Promise<void> {
    if (!config || !href) {
      return;
    }

    const value = parseConfigValue(field, rawValue);

    if (value === null) {
      return;
    }

    const scopeKey = deriveScopeKey(href, entry.scope);

    await saveConfig(updateToolConfigValue(config, scopeKey, entry.id, field.key, value));
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

      {tabUnreachable && (
        <p class="popup-note popup-note--error">
          Pixly can't reach this page — it was loaded before Pixly started or updated. Refresh the
          tab and try again.
        </p>
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

              {entry.help && (
                <button
                  class="tool-card__help-toggle"
                  onClick={() => setOpenHelpId(openHelpId === entry.id ? null : entry.id)}
                >
                  {openHelpId === entry.id ? 'Hide help' : "What's this for?"}
                </button>
              )}

              {entry.help && openHelpId === entry.id && <p class="tool-card__help">{entry.help}</p>}

              {config && activeFlags[entry.id] && entry.configFields && (
                <div class="tool-card__config">
                  {entry.configFields.map((field) => (
                    <label key={field.key} class="config-field">
                      <span class="config-field__label">{field.label}</span>
                      <ConfigFieldInput
                        field={field}
                        value={getToolConfigValue(
                          config,
                          deriveScopeKey(href, entry.scope),
                          entry.id,
                          field.key,
                        )}
                        onCommit={(rawValue) => void changeConfigValue(entry, field, rawValue)}
                      />
                      {field.hint && <span class="config-field__hint">{field.hint}</span>}
                    </label>
                  ))}
                </div>
              )}
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
        Tools stay active on this site across reloads, and only where you turn them on. Live
        controls live in the on-page Pixly pill — click it to expand them.
      </p>
    </div>
  );
}

interface ConfigFieldInputProps {
  field: ToolConfigField;
  value: number | string | undefined;
  onCommit: (rawValue: string) => void;
}

/** Renders the input widget matching a declarative config field's kind (number or select). */
function ConfigFieldInput({ field, value, onCommit }: ConfigFieldInputProps) {
  if (field.kind === 'select') {
    return (
      <select
        value={String(value ?? '')}
        onChange={(event) => onCommit((event.target as HTMLSelectElement).value)}
      >
        {field.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <input
      type="number"
      min={field.min}
      value={value ?? ''}
      onChange={(event) => onCommit((event.target as HTMLInputElement).value)}
    />
  );
}

/** Validates raw input against the field's kind; null means "reject the edit". */
function parseConfigValue(field: ToolConfigField, rawValue: string): number | string | null {
  if (field.kind === 'select') {
    return field.options.some((option) => option.value === rawValue) ? rawValue : null;
  }

  const parsed = Number.parseInt(rawValue, 10);

  if (!Number.isFinite(parsed) || (field.min !== undefined && parsed < field.min)) {
    return null;
  }

  return parsed;
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

/** Requests the optional host permission for the page's origin; resolves false when declined. */
function requestHostPermission(href: string): Promise<boolean> {
  try {
    const url = new URL(href);

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return Promise.resolve(false);
    }

    return chrome.permissions.request({ origins: [`${url.origin}/*`] }).catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}
