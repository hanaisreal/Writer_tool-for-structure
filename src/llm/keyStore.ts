// The visitor's own API keys (Anthropic and/or OpenAI), kept only in this
// browser. Each key is sent only to its provider's API and nowhere else.

export type ProviderId = 'anthropic' | 'openai'

export interface ProviderInfo {
  id: ProviderId
  /** Company / account name, for the key field. */
  label: string
  /** How results are credited in the UI ("Claude is reading…"). */
  ai: string
  host: string
  consoleUrl: string
  placeholder: string
  /** Loose shape check so obvious paste mistakes are caught before a request. */
  looksLikeKey: (k: string) => boolean
  models: { id: string; label: string; hint: string }[]
}

export const PROVIDERS: Record<ProviderId, ProviderInfo> = {
  anthropic: {
    id: 'anthropic',
    label: 'Anthropic',
    ai: 'Claude',
    host: 'api.anthropic.com',
    consoleUrl: 'https://console.anthropic.com/settings/keys',
    placeholder: 'sk-ant-…',
    looksLikeKey: (k) => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k),
    models: [
      { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', hint: 'Most careful judgments' },
      { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', hint: 'Faster, about half the cost' },
    ],
  },
  openai: {
    id: 'openai',
    label: 'OpenAI',
    ai: 'OpenAI',
    host: 'api.openai.com',
    consoleUrl: 'https://platform.openai.com/api-keys',
    placeholder: 'sk-…',
    looksLikeKey: (k) => /^sk-(?!ant-)[A-Za-z0-9_-]{20,}$/.test(k),
    models: [
      { id: 'gpt-5.5', label: 'GPT-5.5', hint: 'Most capable' },
      { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', hint: 'Faster and cheaper' },
    ],
  },
}

export interface LlmSettings {
  /** Which provider's key is used for analysis. */
  provider: ProviderId
  models: Record<ProviderId, string>
  /** Keep keys across browser restarts (localStorage) or only for this tab (sessionStorage). */
  remember: boolean
}

export interface KeySnapshot {
  keys: Partial<Record<ProviderId, string>>
  settings: LlmSettings
  /** The key in use (the active provider's), or null. */
  key: string | null
}

// The Anthropic slot keeps its original storage name so saved keys survive the upgrade.
const KEY_SLOT: Record<ProviderId, string> = { anthropic: 'tv.apiKey.v1', openai: 'tv.apiKey.openai.v1' }
const SETTINGS = 'tv.llm.v2'

const listeners = new Set<() => void>()

function read(storage: Storage, key: string) {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

function snapshot(keys: KeySnapshot['keys'], settings: LlmSettings): KeySnapshot {
  return { keys, settings, key: keys[settings.provider] ?? null }
}

function load(): KeySnapshot {
  let settings: LlmSettings = {
    provider: 'anthropic',
    models: { anthropic: PROVIDERS.anthropic.models[0].id, openai: PROVIDERS.openai.models[0].id },
    remember: true,
  }
  try {
    const saved = JSON.parse(read(localStorage, SETTINGS) ?? '{}')
    settings = { ...settings, ...saved, models: { ...settings.models, ...saved.models } }
  } catch {
    // Defaults.
  }
  const keys: KeySnapshot['keys'] = {}
  for (const id of Object.keys(KEY_SLOT) as ProviderId[]) {
    const k = read(sessionStorage, KEY_SLOT[id]) ?? read(localStorage, KEY_SLOT[id])
    if (k) keys[id] = k
  }
  // If only the other provider has a key, use it.
  if (!keys[settings.provider]) settings.provider = (Object.keys(keys)[0] as ProviderId | undefined) ?? settings.provider
  return snapshot(keys, settings)
}

let current = load()

function commit(next: KeySnapshot) {
  current = next
  try {
    localStorage.setItem(SETTINGS, JSON.stringify(next.settings))
  } catch {
    // Non-essential.
  }
  listeners.forEach((fn) => fn())
}

export const keyStore = {
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  getSnapshot: () => current,

  /** Save a key for a provider and make that provider the active one. */
  save(provider: ProviderId, key: string, model: string, remember: boolean) {
    try {
      localStorage.removeItem(KEY_SLOT[provider])
      sessionStorage.removeItem(KEY_SLOT[provider])
      ;(remember ? localStorage : sessionStorage).setItem(KEY_SLOT[provider], key)
    } catch {
      // Storage blocked: the key still works for this page load.
    }
    const settings = { ...current.settings, provider, remember, models: { ...current.settings.models, [provider]: model } }
    commit(snapshot({ ...current.keys, [provider]: key }, settings))
  },

  clear(provider: ProviderId) {
    try {
      localStorage.removeItem(KEY_SLOT[provider])
      sessionStorage.removeItem(KEY_SLOT[provider])
    } catch {
      // ignore
    }
    const keys = { ...current.keys }
    delete keys[provider]
    // Fall back to the other provider's key if there is one.
    const other = (Object.keys(keys)[0] as ProviderId | undefined) ?? current.settings.provider
    commit(snapshot(keys, { ...current.settings, provider: keys[current.settings.provider] ? current.settings.provider : other }))
  },
}

/** Name to credit AI results with, for the provider currently in use. */
export const activeAiName = () => PROVIDERS[current.settings.provider].ai
