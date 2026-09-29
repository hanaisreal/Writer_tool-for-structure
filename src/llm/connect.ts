// Keeps the analysis status in sync with which AI backend is available:
// the dev server's own Anthropic key, or the visitor's key in this browser.

import { scheduler } from '../analysis/scheduler'
import { store } from '../analysis/store'
import { keyStore } from './keyStore'
import { getBackend, setBackend } from './provider'

let serverLlm = false
let lastKey: string | null = null
let subscribed = false

function sync() {
  const { key } = keyStore.getSnapshot()
  const next = serverLlm ? 'server' : key ? 'browser' : null
  const changed = next !== getBackend() || key !== lastKey
  lastKey = key
  setBackend(next)
  store.setStatus({ backend: next, llm: next ? 'ready' : 'disabled' })
  // A new or changed key gets a fresh attempt at everything that failed.
  if (next && changed) scheduler.retry()
}

export function connectLlm(serverAvailable: boolean) {
  serverLlm = serverAvailable
  if (!subscribed) {
    keyStore.subscribe(sync)
    subscribed = true
  }
  sync()
}

/** Ask the app to show the API key dialog (from anywhere in the UI). */
export const openKeyDialog = () => window.dispatchEvent(new Event('tv:open-key'))
