// Where Claude requests go: the local dev server (which holds its own key), or
// straight from this browser with the visitor's key on the static site.

import type Anthropic from '@anthropic-ai/sdk'
import type { AnalyzeRequest, AnalyzeResponse, EvaluateRequest, EvaluateResponse } from '../../shared/genres'
import { keyStore } from './keyStore'

export type Backend = 'server' | 'browser'

let backend: Backend | null = null
export const setBackend = (b: Backend | null) => {
  backend = b
}
export const getBackend = () => backend

/** Errors the UI can act on (e.g. prompt for a new key). */
export class LlmError extends Error {
  kind: 'auth' | 'rate' | 'refused' | 'other'
  constructor(kind: LlmError['kind'], message: string) {
    super(message)
    this.kind = kind
  }
}

let client: { key: string; sdk: Anthropic } | null = null

async function browserClient(): Promise<Anthropic> {
  const { key } = keyStore.getSnapshot()
  if (!key) throw new LlmError('auth', 'Add your Anthropic API key to analyze with Claude.')
  if (client?.key !== key) {
    const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
    // The key is the visitor's own and stays in their browser; this flag only
    // acknowledges that the SDK is running client-side.
    client = { key, sdk: new AnthropicSDK({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2 }) }
  }
  return client.sdk
}

async function viaBrowser<T>(run: (c: Anthropic, model: string) => Promise<T>): Promise<T> {
  const c = await browserClient()
  const { default: AnthropicSDK } = await import('@anthropic-ai/sdk')
  const { RefusedError } = await import('../../shared/claude')
  try {
    return await run(c, keyStore.getSnapshot().settings.model)
  } catch (err) {
    if (err instanceof AnthropicSDK.AuthenticationError || err instanceof AnthropicSDK.PermissionDeniedError) {
      throw new LlmError('auth', 'Your API key was rejected. Check it in API key settings.')
    }
    if (err instanceof AnthropicSDK.RateLimitError) throw new LlmError('rate', 'Rate limited by the Claude API — try again shortly.')
    if (err instanceof RefusedError) throw new LlmError('refused', err.message)
    if (err instanceof AnthropicSDK.APIError) throw new LlmError('other', `Claude API error (${err.status ?? 'network'}).`)
    throw err
  }
}

async function viaServer<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!res.ok) {
    const msg = (await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`
    throw new LlmError(res.status === 401 ? 'auth' : res.status === 429 ? 'rate' : 'other', res.status === 401 ? 'Signed out — sign in again to analyze.' : msg)
  }
  return (await res.json()) as T
}

export async function analyzeParagraph(req: AnalyzeRequest): Promise<AnalyzeResponse> {
  if (backend === 'server') return viaServer('/api/analyze', req)
  const { analyzeParagraph: run } = await import('../../shared/claude')
  return viaBrowser((c, model) => run(c, req, { model, effort: 'low' }))
}

export async function evaluateEssay(req: EvaluateRequest): Promise<EvaluateResponse> {
  if (backend === 'server') return viaServer('/api/evaluate', req)
  const { evaluateEssay: run } = await import('../../shared/claude')
  return viaBrowser((c, model) => run(c, req, { model, effort: 'medium' }))
}
