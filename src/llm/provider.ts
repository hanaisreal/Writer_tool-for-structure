// Where AI requests go: the local dev server (which holds its own Anthropic
// key), or straight from this browser with the visitor's Anthropic or OpenAI key.

import type Anthropic from '@anthropic-ai/sdk'
import type OpenAI from 'openai'
import type { AnalyzeRequest, AnalyzeResponse, EvaluateRequest, EvaluateResponse } from '../../shared/genres'
import type { CommentsRequest, CommentsResponse } from '../../shared/comments'
import { keyStore, PROVIDERS, type ProviderId } from './keyStore'

export type Backend = 'server' | 'browser'

let backend: Backend | null = null
export const setBackend = (b: Backend | null) => {
  backend = b
}
export const getBackend = () => backend

/** Name to credit results with: the server always uses Claude. */
export const aiName = () => (backend === 'server' ? 'Claude' : PROVIDERS[keyStore.getSnapshot().settings.provider].ai)

/** Errors the UI can act on (e.g. prompt for a new key). */
export class LlmError extends Error {
  kind: 'auth' | 'rate' | 'refused' | 'other'
  constructor(kind: LlmError['kind'], message: string) {
    super(message)
    this.kind = kind
  }
}

const clients: { anthropic?: { key: string; sdk: Anthropic }; openai?: { key: string; sdk: OpenAI } } = {}

// The keys are the visitor's own and stay in their browser; `dangerouslyAllowBrowser`
// only acknowledges that each SDK is running client-side.
async function anthropicClient(key: string): Promise<Anthropic> {
  if (clients.anthropic?.key !== key) {
    const { default: SDK } = await import('@anthropic-ai/sdk')
    clients.anthropic = { key, sdk: new SDK({ apiKey: key, dangerouslyAllowBrowser: true }) }
  }
  return clients.anthropic.sdk
}

async function openaiClient(key: string): Promise<OpenAI> {
  if (clients.openai?.key !== key) {
    const { default: SDK } = await import('openai')
    clients.openai = { key, sdk: new SDK({ apiKey: key, dangerouslyAllowBrowser: true }) }
  }
  return clients.openai.sdk
}

/** Translate either SDK's errors into ones the UI understands. */
async function toLlmError(provider: ProviderId, err: unknown): Promise<unknown> {
  const { RefusedError } = await import('../../shared/prompts')
  if (err instanceof RefusedError) return new LlmError('refused', err.message)
  const name = PROVIDERS[provider].label
  const SDK = provider === 'anthropic' ? (await import('@anthropic-ai/sdk')).default : (await import('openai')).default
  if (err instanceof SDK.AuthenticationError || err instanceof SDK.PermissionDeniedError) {
    return new LlmError('auth', `Your ${name} API key was rejected. Check it in API key settings.`)
  }
  if (err instanceof SDK.RateLimitError) return new LlmError('rate', `Rate limited by the ${name} API — try again shortly.`)
  if (err instanceof SDK.NotFoundError) return new LlmError('other', `The selected ${name} model isn’t available to this key.`)
  if (err instanceof SDK.APIError) return new LlmError('other', `${name} API error (${err.status ?? 'network'}).`)
  return err
}

async function inBrowser<T>(run: { anthropic: (c: Anthropic, model: string) => Promise<T>; openai: (c: OpenAI, model: string) => Promise<T> }): Promise<T> {
  const { settings, key } = keyStore.getSnapshot()
  const provider = settings.provider
  if (!key) throw new LlmError('auth', 'Add an API key to analyze your own writing.')
  const model = settings.models[provider]
  try {
    return provider === 'anthropic' ? await run.anthropic(await anthropicClient(key), model) : await run.openai(await openaiClient(key), model)
  } catch (err) {
    throw await toLlmError(provider, err)
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
  const [claude, gpt] = await Promise.all([import('../../shared/claude'), import('./openai')])
  return inBrowser({
    anthropic: (c, model) => claude.analyzeParagraph(c, req, { model, effort: 'low' }),
    openai: (c, model) => gpt.analyzeParagraph(c, req, model),
  })
}

export async function evaluateEssay(req: EvaluateRequest): Promise<EvaluateResponse> {
  if (backend === 'server') return viaServer('/api/evaluate', req)
  const [claude, gpt] = await Promise.all([import('../../shared/claude'), import('./openai')])
  return inBrowser({
    anthropic: (c, model) => claude.evaluateEssay(c, req, { model, effort: 'medium' }),
    openai: (c, model) => gpt.evaluateEssay(c, req, model),
  })
}

/** Check a key (and that the model exists) with a free metadata call before saving it. */
export async function verifyKey(provider: ProviderId, key: string, model: string): Promise<string | null> {
  try {
    // One-off clients without retries, so a bad key fails fast.
    if (provider === 'anthropic') {
      const { default: SDK } = await import('@anthropic-ai/sdk')
      await new SDK({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 0 }).models.retrieve(model)
    } else {
      const { default: SDK } = await import('openai')
      await new SDK({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 0 }).models.retrieve(model)
    }
    return null
  } catch (err) {
    const e = await toLlmError(provider, err)
    if (e instanceof LlmError) {
      if (e.kind === 'auth') return `${PROVIDERS[provider].label} rejected this key. Check that it was copied completely.`
      return e.message
    }
    return `Couldn’t reach ${PROVIDERS[provider].host}. Check your connection and try again.`
  }
}

export async function commentEssay(req: CommentsRequest): Promise<CommentsResponse> {
  if (backend === 'server') return viaServer('/api/comments', req)
  const [claude, gpt] = await Promise.all([import('../../shared/claude'), import('./openai')])
  return inBrowser({
    anthropic: (c, model) => claude.commentEssay(c, req, { model, effort: 'medium' }),
    openai: (c, model) => gpt.commentEssay(c, req, model),
  })
}
