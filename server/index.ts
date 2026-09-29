import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import Anthropic from '@anthropic-ai/sdk'
import cookieSession from 'cookie-session'
import express from 'express'
import type { AnalyzeRequest, EvaluateRequest, MeResponse } from '../shared/genres.ts'
import { analyze, comment, evaluate, llmEnabled, MODEL, RefusedError } from './analyze.ts'
import type { CommentsRequest } from '../shared/comments.ts'
import { authConfig, authRouter, requireAuth } from './auth.ts'

// Not PORT: dev tooling often sets PORT for the web server, which would collide.
const PORT = Number(process.env.API_PORT ?? 8787)

let secret = process.env.SESSION_SECRET
if (!secret) {
  secret = randomBytes(32).toString('hex')
  console.warn('[server] SESSION_SECRET not set; using a random one (sessions reset on restart).')
}

const app = express()
app.use(express.json({ limit: '1mb' }))
app.use(
  cookieSession({
    name: 'tv_session',
    keys: [secret],
    httpOnly: true,
    sameSite: 'lax',
    secure: authConfig.appOrigin.startsWith('https://'),
    maxAge: 7 * 24 * 60 * 60 * 1000,
  }),
)

app.use('/auth', authRouter())

app.get('/api/me', (req, res) => {
  const body: MeResponse = {
    authEnabled: authConfig.enabled,
    llmEnabled,
    model: llmEnabled ? MODEL : null,
    user: req.session?.user ?? null,
  }
  res.json(body)
})

function isAnalyzeRequest(b: unknown): b is AnalyzeRequest {
  const r = b as AnalyzeRequest
  return (
    !!r &&
    typeof r.genre === 'string' &&
    typeof r.title === 'string' &&
    Array.isArray(r.paragraphs) &&
    r.paragraphs.every((p) => typeof p === 'string') &&
    Number.isInteger(r.target) &&
    r.target >= 0 &&
    r.target < r.paragraphs.length &&
    Array.isArray(r.sentences) &&
    r.sentences.length > 0 &&
    r.sentences.length <= 60 &&
    r.sentences.every((s) => typeof s?.id === 'string' && typeof s?.text === 'string')
  )
}

const isParagraphs = (p: unknown): p is string[] => Array.isArray(p) && p.length > 0 && p.length <= 400 && p.every((x) => typeof x === 'string')

function isEvaluateRequest(b: unknown): b is EvaluateRequest {
  const r = b as EvaluateRequest
  return !!r && typeof r.genre === 'string' && typeof r.title === 'string' && typeof r.rubric === 'string' && isParagraphs(r.paragraphs)
}

function isCommentsRequest(b: unknown): b is CommentsRequest {
  const r = b as CommentsRequest
  return (
    !!r &&
    typeof r.genre === 'string' &&
    typeof r.title === 'string' &&
    isParagraphs(r.paragraphs) &&
    Number.isInteger(r.maxComments) &&
    r.maxComments > 0 &&
    r.maxComments <= 40
  )
}

function sendError(res: express.Response, err: unknown, tag: string) {
  if (err instanceof RefusedError) {
    res.status(422).json({ error: err.message })
  } else if (err instanceof Anthropic.RateLimitError) {
    res.status(429).json({ error: 'Rate limited by the Claude API — try again shortly.' })
  } else if (err instanceof Anthropic.AuthenticationError) {
    res.status(502).json({ error: 'The server’s Anthropic API key was rejected.' })
  } else if (err instanceof Anthropic.APIError) {
    console.error(`[${tag}]`, err.status, err.message)
    res.status(502).json({ error: `Claude API error (${err.status ?? 'network'}).` })
  } else {
    console.error(`[${tag}]`, err)
    res.status(500).json({ error: 'Request failed.' })
  }
}

app.post('/api/analyze', requireAuth, async (req, res) => {
  if (!llmEnabled) {
    res.status(503).json({ error: 'LLM analysis is not configured on the server.' })
    return
  }
  if (!isAnalyzeRequest(req.body)) {
    res.status(400).json({ error: 'Malformed analyze request.' })
    return
  }
  try {
    res.json(await analyze(req.body))
  } catch (err) {
    sendError(res, err, 'analyze')
  }
})

app.post('/api/evaluate', requireAuth, async (req, res) => {
  if (!llmEnabled) {
    res.status(503).json({ error: 'Claude is not configured on the server.' })
    return
  }
  if (!isEvaluateRequest(req.body)) {
    res.status(400).json({ error: 'Malformed evaluate request.' })
    return
  }
  try {
    res.json(await evaluate(req.body))
  } catch (err) {
    sendError(res, err, 'evaluate')
  }
})

app.post('/api/comments', requireAuth, async (req, res) => {
  if (!llmEnabled) {
    res.status(503).json({ error: 'Claude is not configured on the server.' })
    return
  }
  if (!isCommentsRequest(req.body)) {
    res.status(400).json({ error: 'Malformed comments request.' })
    return
  }
  try {
    res.json(await comment(req.body))
  } catch (err) {
    sendError(res, err, 'comments')
  }
})

app.listen(PORT, () => {
  console.log(`[server] listening on http://localhost:${PORT}`)
  console.log(`[server] Google login: ${authConfig.enabled ? `on (redirect ${authConfig.redirectUri})` : 'off — set GOOGLE_CLIENT_ID/SECRET'}`)
  console.log(`[server] Claude analysis: ${llmEnabled ? `on (${MODEL})` : 'off — set ANTHROPIC_API_KEY; the editor falls back to local estimates'}`)
})
