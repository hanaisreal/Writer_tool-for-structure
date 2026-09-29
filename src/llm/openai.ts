// OpenAI calls for visitors who bring an OpenAI key instead of an Anthropic
// one. Same prompts, schemas and normalization as Claude (shared/prompts.ts),
// via the Responses API with structured outputs.

import type OpenAI from 'openai'
import { zodTextFormat } from 'openai/helpers/zod'
import type { AnalyzeRequest, AnalyzeResponse, EvaluateRequest, EvaluateResponse } from '../../shared/genres'
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
} from '../../shared/prompts'

type Response = Awaited<ReturnType<OpenAI['responses']['parse']>>

/** A refusal arrives as a content part instead of parsed JSON. */
function refused(response: Response) {
  return response.output.some((item) => item.type === 'message' && item.content.some((c) => c.type === 'refusal'))
}

export async function analyzeParagraph(client: OpenAI, req: AnalyzeRequest, model: string): Promise<AnalyzeResponse> {
  const response = await client.responses.parse({
    model,
    instructions: analyzeSystem(req.genre),
    input: analyzeUser(req),
    text: { format: zodTextFormat(Analysis, 'sentence_analysis') },
  })
  if (refused(response)) throw new RefusedError('The model declined to analyze this paragraph.')
  if (!response.output_parsed) throw new Error(`Could not parse analysis (status: ${response.status})`)
  return normalizeAnalysis(response.output_parsed, req)
}

export async function evaluateEssay(client: OpenAI, req: EvaluateRequest, model: string): Promise<EvaluateResponse> {
  const response = await client.responses.parse({
    model,
    instructions: evaluateSystem(req.genre),
    input: evaluateUser(req),
    text: { format: zodTextFormat(Evaluation, 'essay_evaluation') },
  })
  if (refused(response)) throw new RefusedError('The model declined to evaluate this essay.')
  if (!response.output_parsed) throw new Error(`Could not parse evaluation (status: ${response.status})`)
  return normalizeEvaluation(response.output_parsed, req)
}
