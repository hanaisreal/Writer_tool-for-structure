// The visitor's own Anthropic API key, kept only in this browser. It is sent
// directly to api.anthropic.com and nowhere else.

const LOCAL = 'tv.apiKey.v1'
const SETTINGS = 'tv.llm.v1'

export interface LlmSettings {
  model: string
  /** Keep the key across browser restarts (localStorage) or only for this tab (sessionStorage). */
  remember: boolean
}

export const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', hint: 'Most careful judgments' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', hint: 'Faster, about half the cost' },
]

const listeners = new Set<() => void>()
const emit = () => listeners.forEach((fn) => fn())

function read(storage: Storage, key: string) {
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

let cached: { key: string | null; settings: LlmSettings } = load()

function load() {
  let settings: LlmSettings = { model: MODELS[0].id, remember: true }
  try {
    settings = { ...settings, ...JSON.parse(read(localStorage, SETTINGS) ?? '{}') }
  } catch {
    // Defaults.
  }
  return { key: read(sessionStorage, LOCAL) ?? read(localStorage, LOCAL), settings }
}

export const keyStore = {
  subscribe(fn: () => void) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },
  getSnapshot: () => cached,

  save(key: string, settings: LlmSettings) {
    try {
      localStorage.removeItem(LOCAL)
      sessionStorage.removeItem(LOCAL)
      ;(settings.remember ? localStorage : sessionStorage).setItem(LOCAL, key)
      localStorage.setItem(SETTINGS, JSON.stringify(settings))
    } catch {
      // Storage blocked: the key still works for this page load.
    }
    cached = { key, settings }
    emit()
  },

  clear() {
    try {
      localStorage.removeItem(LOCAL)
      sessionStorage.removeItem(LOCAL)
    } catch {
      // ignore
    }
    cached = { ...cached, key: null }
    emit()
  },
}

/** Loose shape check so obvious paste mistakes are caught before a request. */
export const looksLikeKey = (k: string) => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(k.trim())
