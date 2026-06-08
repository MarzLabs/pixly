import type {
  PixlyConfig,
  ScopeRecord,
  ToolStateMap,
} from '@shared/types';
import type { ToolId } from '@shared/constants';

/**
 * Pure operations over the {@link PixlyConfig} document. These are isolated from chrome.storage
 * so the persistence-by-scope rules (spec §5, RF-ACT-2/3/4) can be unit-tested directly.
 *
 * Every function is immutable: it returns a new document and never mutates its input, which keeps
 * change detection trivial and avoids accidental shared-reference bugs across contexts.
 */

export function createEmptyConfig(): PixlyConfig {
  return { globalEnabled: true, scopes: {} };
}

function getOrCreateScope(config: PixlyConfig, scopeKey: string): ScopeRecord {
  return config.scopes[scopeKey] ?? { activeToolIds: [], states: {} };
}

/** Returns true when a tool is active for the given scope key. */
export function isToolActive(config: PixlyConfig, scopeKey: string, toolId: ToolId): boolean {
  const record = config.scopes[scopeKey];

  return record?.activeToolIds.includes(toolId) ?? false;
}

/** Lists active tool ids for a scope key (empty when none). */
export function getActiveToolIds(config: PixlyConfig, scopeKey: string): ToolId[] {
  return config.scopes[scopeKey]?.activeToolIds ?? [];
}

export function getToolState<K extends keyof ToolStateMap>(
  config: PixlyConfig,
  scopeKey: string,
  toolId: K,
): ToolStateMap[K] | undefined {
  return config.scopes[scopeKey]?.states[toolId];
}

/** Activates a tool for a scope key, optionally seeding its initial state. Idempotent. */
export function activateTool<K extends keyof ToolStateMap>(
  config: PixlyConfig,
  scopeKey: string,
  toolId: K,
  initialState: ToolStateMap[K],
): PixlyConfig {
  const record = getOrCreateScope(config, scopeKey);

  const activeToolIds = record.activeToolIds.includes(toolId)
    ? record.activeToolIds
    : [...record.activeToolIds, toolId];

  const states = { ...record.states, [toolId]: record.states[toolId] ?? initialState };

  return {
    ...config,
    scopes: { ...config.scopes, [scopeKey]: { activeToolIds, states } },
  };
}

/** Deactivates a tool for a scope key and drops its stored state. Idempotent. */
export function deactivateTool(
  config: PixlyConfig,
  scopeKey: string,
  toolId: ToolId,
): PixlyConfig {
  const record = config.scopes[scopeKey];

  if (!record) {
    return config;
  }

  const activeToolIds = record.activeToolIds.filter((id) => id !== toolId);

  const states = { ...record.states };
  delete states[toolId];

  const nextRecord: ScopeRecord = { activeToolIds, states };

  // Drop the whole scope entry once it holds nothing, so isolation stays clean (RF-ACT-3).
  if (activeToolIds.length === 0 && Object.keys(states).length === 0) {
    const scopes = { ...config.scopes };
    delete scopes[scopeKey];

    return { ...config, scopes };
  }

  return { ...config, scopes: { ...config.scopes, [scopeKey]: nextRecord } };
}

/** Persists the latest serialized state for an already-active tool (RF-ACT-4). */
export function updateToolState<K extends keyof ToolStateMap>(
  config: PixlyConfig,
  scopeKey: string,
  toolId: K,
  state: ToolStateMap[K],
): PixlyConfig {
  const record = getOrCreateScope(config, scopeKey);

  return {
    ...config,
    scopes: {
      ...config.scopes,
      [scopeKey]: { ...record, states: { ...record.states, [toolId]: state } },
    },
  };
}

export function setGlobalEnabled(config: PixlyConfig, enabled: boolean): PixlyConfig {
  return { ...config, globalEnabled: enabled };
}
