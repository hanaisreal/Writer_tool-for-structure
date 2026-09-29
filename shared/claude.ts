// Anthropic (Claude) calls, shared by the local server and the browser
// (bring-your-own-key on the static site). Callers pass their own client, so
// the API key never has to leave the machine that owns it.

import type Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { AnalyzeRequest, AnalyzeResponse, EvaluateRequest, EvaluateResponse } from './genres.ts'
import {
  Analysis,
  analyzeSystem,
  analyzeUser,
  Evaluation,
  evaluateSystem,
  evaluateUser,
  normalizeAnalysis,
  normalizeEvaluation,
  RefusedError,
} from './prompts.ts'

export { RefusedError }

export const DEFAULT_MODEL = 'claude-opus-5-5'
export type Effort = 'low' | 'medium' | 'high'

export interface CallOptions {
  model?: string
  effort?: Effort
}

export async function analyzeParagraph(client: Anthropic, req: AnalyzeRequest, opts: CallOptions = {}): Promise<AnalyzeResponse> {
  const response = await client.beta.messages.parse({
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: opts.effort ?? 'low', format: betaZodOutputFormat(Analysis) },
    system: analyzeSystem(req.genre),
    messages: [{ role: 'user', content: analyzeUser(req) }],
  })
  if (response.stop_reason === 'refusal') throw new RefusedError('The model declined to analyze this paragraph.')
  if (!response.parsed_output) throw new Error(`Could not parse analysis (stop_reason: ${response.stop_reason})`)
  return normalizeAnalysis(response.parsed_output, req)
}

export async function evaluateEssay(client: Anthropic, req: EvaluateRequest, opts: CallOptions = {}): Promise<EvaluateResponse> {
  const response = await client.beta.messages.parse({
    model: opts.model ?? DEFAULT_MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: opts.effort ?? 'medium', format: betaZodOutputFormat(Evaluation) },
    system: evaluateSystem(req.genre),
    messages: [{ role: 'user', content: evaluateUser(req) }],
  })
  if (response.stop_reason === 'refusal') throw new RefusedError('The model declined to evaluate this essay.')
  if (!response.parsed_output) throw new Error(`Could not parse evaluation (stop_reason: ${response.stop_reason})`)
  return normalizeEvaluation(response.parsed_output, req)
}
