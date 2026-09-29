// Server-side Claude client for local development. The SDK resolves credentials
// itself (ANTHROPIC_API_KEY, or an `ant auth login` profile).

import Anthropic from '@anthropic-ai/sdk'
import type { AnalyzeRequest, EvaluateRequest } from '../shared/genres.ts'
import { analyzeParagraph, DEFAULT_MODEL, evaluateEssay, type Effort } from '../shared/claude.ts'

export { RefusedError } from '../shared/claude.ts'

export const MODEL = process.env.ANALYSIS_MODEL ?? DEFAULT_MODEL
export const llmEnabled = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANALYSIS_FORCE_ENABLE)
const client = llmEnabled ? new Anthropic() : null

export function analyze(req: AnalyzeRequest) {
  if (!client) throw new Error('LLM not configured')
  return analyzeParagraph(client, req, { model: MODEL, effort: (process.env.ANALYSIS_EFFORT ?? 'low') as Effort })
}

export function evaluate(req: EvaluateRequest) {
  if (!client) throw new Error('LLM not configured')
  return evaluateEssay(client, req, { model: MODEL, effort: (process.env.EVAL_EFFORT ?? 'medium') as Effort })
}
