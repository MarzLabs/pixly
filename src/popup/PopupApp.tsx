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
import type { LicenseReply } from '@shared/messaging/messages';
import { computePlan, isProTool, type LicenseDocument } from '@shared/licensing/license-plan';
import { loadLicenseDocument, onLicenseChanged } from '@shared/licensing/license-store';
import { GUMROAD_PRODUCT_URL } from '@shared/licensing/gumroad';

/**
 * Pixly popup (spec §8, RF-UI-2). Shows every tool from the catalog as a grid of toggle tiles —
 * one click on a tile enables/disables the tool on this site — plus a global enable switch. The
 * column count lives in a single CSS variable (--popup-grid-columns in popup.css). Each tile's
 * Hovering (or keyboard-focusing) a tile previews the tool's help note in the fixed hint bar at
 * the bottom of the popup — no popover, so nothing occludes the grid while scanning. Each tile's
 * "?" button opens a detail panel under the grid with the tool's description, help note and the
 * set-and-forget config fields declared in the catalog — live controls stay in the in-page widget.
 * Toggling never mutates the page directly: it asks the active tab's content script, which updates
 * storage and reconciles. Config edits are written straight to storage; the content script picks
 * them up via onChanged and applies them to live tools.
 */
export function PopupApp() {
  const [config, setConfig] = useState<PixlyConfig | null>(null);
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);
  const [tabUnreachable, setTabUnreachable] = useState(false);
  const [detailToolId, setDetailToolId] = useState<ToolId | null>(null);
  const [hoveredToolId, setHoveredToolId] = useState<ToolId | null>(null);
  const [license, setLicense] = useState<LicenseDocument | null>(null);

  useEffect(() => {
    void initialize();

    const unsubscribeConfig = onConfigChanged(setConfig);
    const unsubscribeLicense = onLicenseChanged(setLicense);

    return () => {
      unsubscribeConfig();
      unsubscribeLicense();
    };
  }, []);

  async function initialize(): Promise<void> {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    setTab(activeTab ?? null);
    setConfig(await loadConfig());
    setLicense(await loadLicenseDocument());
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
  const detailEntry = TOOL_CATALOG.find((entry) => entry.id === detailToolId) ?? null;
  const hoveredEntry = TOOL_CATALOG.find((entry) => entry.id === hoveredToolId) ?? null;
  // Until the license document loads (one storage read), render without locks to avoid a flash.
  const planInfo = useMemo(() => (license ? computePlan(license, Date.now()) : null), [license]);
  const freePlan = planInfo?.plan === 'free';

  return (
    <div>
      <header class="popup-header">
        <span class="popup-title">Pixly</span>
        {planInfo?.plan === 'pro' && <ProBadge licenseKey={license?.licenseKey ?? ''} />}
      </header>

      {href && <div class="popup-subtitle">{href}</div>}

      {planInfo && planInfo.plan !== 'pro' && <LicenseBanner planInfo={planInfo} />}

      {!reachable && (
        <p class="popup-note">Pixly can't run on this page (browser/internal page).</p>
      )}

      {tabUnreachable && (
        <p class="popup-note popup-note--error">
          Pixly can't reach this page — it was loaded before Pixly started or updated. Refresh the
          tab and try again.
        </p>
      )}

      <div class="tool-grid">
        {TOOL_CATALOG.map((entry) => {
          // Locked tiles show inactive even if the stored config still lists the tool as active:
          // the content script filters Pro tools out on the free plan, so inactive is the truth.
          const locked = freePlan && isProTool(entry.id);
          const active = !locked && (activeFlags[entry.id] ?? false);

          return (
            <div
              key={entry.id}
              class={`tool-tile${active ? ' tool-tile--active' : ''}`}
              onMouseEnter={() => setHoveredToolId(entry.id)}
              onMouseLeave={() => setHoveredToolId(null)}
              onFocusCapture={() => setHoveredToolId(entry.id)}
              onBlurCapture={() => setHoveredToolId(null)}
            >
              <button
                class="tool-tile__toggle"
                disabled={!reachable || !globalEnabled || locked}
                aria-pressed={active}
                onClick={() => void toggleTool(entry, !active)}
              >
                <span class="tool-tile__icon" dangerouslySetInnerHTML={{ __html: entry.icon }} />
                <span class="tool-tile__name">{entry.name}</span>
                <span class="tool-tile__scope">{entry.scope}</span>
              </button>
              {locked && <span class="tool-tile__pro">PRO</span>}
              <button
                class="tool-tile__info"
                aria-label={`About ${entry.name}`}
                aria-expanded={detailToolId === entry.id}
                onClick={() => setDetailToolId(detailToolId === entry.id ? null : entry.id)}
              >
                ?
              </button>
            </div>
          );
        })}
      </div>

      {detailEntry && (
        <article class="tool-detail">
          <div class="tool-detail__name">
            {detailEntry.name}
            <span class="tool-detail__scope">{detailEntry.scope}</span>
          </div>
          <div class="tool-detail__desc">{detailEntry.description}</div>

          {detailEntry.help && <p class="tool-detail__help">{detailEntry.help}</p>}

          {config && activeFlags[detailEntry.id] && detailEntry.configFields && (
            <div class="tool-detail__config">
              {detailEntry.configFields.map((field) => (
                <label key={field.key} class="config-field">
                  <span class="config-field__label">{field.label}</span>
                  <ConfigFieldInput
                    field={field}
                    value={getToolConfigValue(
                      config,
                      deriveScopeKey(href, detailEntry.scope),
                      detailEntry.id,
                      field.key,
                    )}
                    onCommit={(rawValue) => void changeConfigValue(detailEntry, field, rawValue)}
                  />
                  {field.hint && <span class="config-field__hint">{field.hint}</span>}
                </label>
              ))}
            </div>
          )}
        </article>
      )}

      <div class="popup-global">
        <span class="popup-global__label">Pixly enabled</span>
        <Switch
          checked={globalEnabled}
          disabled={!reachable}
          onChange={(value) => void toggleGlobal(value)}
        />
      </div>

      {/* Fixed hint bar: previews the hovered/focused tool's help without occluding the grid. */}
      <p class="popup-note popup-note--hint" aria-live="polite">
        {hoveredEntry ? (
          <>
            <span class="popup-note__tool">{hoveredEntry.name}.</span>{' '}
            {freePlan && isProTool(hoveredEntry.id) && (
              <span class="popup-note__tool">Pro tool — unlock it with Pixly Pro. </span>
            )}
            {hoveredEntry.help ?? hoveredEntry.description}
          </>
        ) : (
          'Tools stay active on this site across reloads, and only where you turn them on. Live ' +
          'controls live in the on-page Pixly pill — click it to expand them.'
        )}
      </p>
    </div>
  );
}

interface LicenseBannerProps {
  planInfo: { plan: 'trial' | 'free' | 'pro'; trialDaysLeft: number };
}

/**
 * Slim, non-blocking plan banner (trial countdown or free-plan notice) with an upgrade link and
 * an expandable license-key form. Activation is delegated to the service worker so closing the
 * popup mid-verification cannot lose the result; success arrives back via onLicenseChanged.
 */
function LicenseBanner({ planInfo }: LicenseBannerProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activate(event: Event): Promise<void> {
    event.preventDefault();

    if (activating) {
      return;
    }

    setActivating(true);
    setError(null);

    const reply = (await chrome.runtime
      .sendMessage({ type: 'pixly/activate-license', licenseKey: keyDraft })
      .catch(() => undefined)) as LicenseReply | undefined;

    setActivating(false);

    if (!reply?.ok) {
      setError(reply && !reply.ok ? reply.error : 'Activation failed. Try again.');
    }
    // On success the license storage change re-renders the popup into the Pro state.
  }

  return (
    <>
      <div class="license-banner">
        <span class="license-banner__text">
          {planInfo.plan === 'trial'
            ? `Pro trial — ${planInfo.trialDaysLeft} day${planInfo.trialDaysLeft === 1 ? '' : 's'} left`
            : 'Free plan — Pro tools are locked'}
        </span>
        <a class="license-banner__cta" href={GUMROAD_PRODUCT_URL} target="_blank" rel="noreferrer">
          Get Pro
        </a>
        <button
          class="license-banner__key"
          aria-expanded={formOpen}
          onClick={() => setFormOpen(!formOpen)}
        >
          License key
        </button>
      </div>

      {formOpen && (
        <form class="license-form" onSubmit={(event) => void activate(event)}>
          <input
            type="text"
            value={keyDraft}
            placeholder="Paste your Gumroad license key"
            spellcheck={false}
            onInput={(event) => setKeyDraft((event.target as HTMLInputElement).value)}
          />
          <button type="submit" disabled={activating || keyDraft.trim() === ''}>
            {activating ? 'Checking…' : 'Activate'}
          </button>
          {error && <span class="license-form__error">{error}</span>}
        </form>
      )}
    </>
  );
}

interface ProBadgeProps {
  licenseKey: string;
}

/** Header "PRO" chip; clicking it reveals the masked key and a remove-license escape hatch. */
function ProBadge({ licenseKey }: ProBadgeProps) {
  const [open, setOpen] = useState(false);

  return (
    <span class="pro-badge">
      {open && (
        <span class="pro-badge__detail">
          …{licenseKey.slice(-8)}
          <button
            class="pro-badge__remove"
            onClick={() => void chrome.runtime.sendMessage({ type: 'pixly/remove-license' })}
          >
            Remove
          </button>
        </span>
      )}
      <button class="pro-badge__chip" aria-expanded={open} onClick={() => setOpen(!open)}>
        PRO
      </button>
    </span>
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
