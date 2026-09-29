// Provider-neutral pieces of the model calls: prompts, output schemas, and
// normalization of the model's answers. shared/claude.ts (Anthropic) and
// src/llm/openai.ts (OpenAI) both build on these, so every provider is judged
// by the same rubric and returns the same shapes.

import { z } from 'zod'
import {
  AXIS_IDS,
  ROLE_IDS,
  getGenre,
  type AnalyzeRequest,
  type AnalyzeResponse,
  type AxisId,
  type EvaluateRequest,
  type EvaluateResponse,
  type SegmentRole,
} from './genres.ts'

export class RefusedError extends Error {}

const isRole = (r: string): r is SegmentRole => r === 'none' || (ROLE_IDS as readonly string[]).includes(r)
const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : lo)

// ---- Per-paragraph analysis ----

export const Analysis = z.object({
  sentences: z.array(
    z.object({
      id: z.string(),
      stakes: z.number(),
      uncertainty: z.number(),
      surprise: z.number(),
      pace: z.number(),
      density: z.number(),
      valence: z.number(),
      // Plain string, normalized below: one off-list role shouldn't fail the whole paragraph.
      segments: z.array(z.object({ text: z.string(), role: z.string(), strength: z.number() })),
      note: z.string(),
    }),
  ),
})

export function analyzeSystem(genreId: string) {
  const g = getGenre(genreId)
  const axes = g.axes.map((a) => `- ${a.id}: ${a.rubric}`).join('\n')
  const roles = g.roles.map((r) => `- ${r.id}: ${r.rubric}`).join('\n')
  return `You are a developmental editor measuring the tension of a piece of writing, sentence by sentence, for a visualization the writer uses while revising.

${g.framing}

Score every sentence of the target paragraph on each axis. Judge each sentence in the context of the whole piece and of what the reader has read up to that point. Use the full range: most sentences in a good essay are unremarkable on most axes, so reserve high values for sentences that genuinely stand out. Scores are 0 to 1, except valence which is -1 to 1.

Axes:
${axes}

Argument roles — split each sentence into one or more consecutive spans and label each span with a role. Each span's text must be copied verbatim from the sentence (same characters, same order), and the spans together should cover the sentence. Split only where the role genuinely changes (for example, a counterargument clause followed by a rebuttal clause); otherwise use one span.
Roles (use exactly these ids):
${roles}
- none: the span does no argumentative work — filler, throat-clearing, repetition, or decoration. Be honest; the writer wants to find these.

strength (per span, 0 to 1): how clearly and effectively the span does its role. 0.2 = only nominally (a vague point, weak or generic evidence, analysis that restates); 0.5 = does the job adequately; 0.9 = does it sharply and memorably. Use 0 for role none.

note: at most 18 words telling the writer the single most useful observation about this sentence's contribution to tension or tightness. Be specific and concrete; do not restate the scores.`
}

export function analyzeUser(req: AnalyzeRequest) {
  const essay = req.paragraphs.map((p, i) => `[P${i + 1}]${i === req.target ? ' (target)' : ''} ${p}`).join('\n\n')
  const sentences = req.sentences.map((s) => `[${s.id}] ${s.text}`).join('\n')
  return `<essay title="${req.title.replace(/"/g, "'")}">
${essay}
</essay>

Target paragraph: P${req.target + 1} of ${req.paragraphs.length}. Score each of these sentences, returning one entry per id:
${sentences}`
}

export function normalizeAnalysis(parsed: z.infer<typeof Analysis>, req: AnalyzeRequest): AnalyzeResponse {
  const known = new Set(req.sentences.map((s) => s.id))
  return {
    sentences: parsed.sentences
      .filter((s) => known.has(s.id))
      .map((s) => {
        const scores = Object.fromEntries(AXIS_IDS.map((a) => [a, clamp(s[a], a === 'valence' ? -1 : 0, 1)])) as Record<AxisId, number>
        // An off-list label means the model saw no clear job for the span.
        const segments = s.segments.map((seg) =>
          isRole(seg.role) ? { text: seg.text, role: seg.role, strength: clamp(seg.strength, 0, 1) } : { text: seg.text, role: 'none' as const, strength: 0 },
        )
        return { id: s.id, note: s.note, ...scores, segments }
      }),
  }
}

// ---- Whole-essay evaluation ----

export const Evaluation = z.object({
  overall: z.number(),
  summary: z.string(),
  rubric: z.array(z.object({ id: z.string(), score: z.number(), comment: z.string() })),
  balance: z.string(),
  suggestions: z.array(z.object({ priority: z.string(), title: z.string(), detail: z.string(), quote: z.string() })),
})

export function evaluateSystem(genreId: string) {
  const g = getGenre(genreId)
  const rubric = g.rubric.map((r) => `- ${r.id} (${r.label}): ${r.rubric}`).join('\n')
  const bands = Object.entries(g.balance)
    .map(([role, [lo, hi]]) => `${role} ${Math.round(lo * 100)}–${Math.round(hi * 100)}%`)
    .join(', ')
  return `You are a demanding, constructive writing teacher grading a piece for its author, who wants dense, tight writing with well-placed tension and surprise.

${g.framing}

Score each rubric criterion 0–10 (5 = competent, 7 = strong, 9 = exceptional; use decimals sparingly). Then give an overall score 0–100 that reflects how well the piece works as a whole — not a mechanical average.
Rubric (use exactly these ids):
${rubric}

You will also get the share of words the essay spends on each argument role ("none" = text with no argumentative job). Healthy ranges: ${bands}. In "balance", say in 1–2 sentences what the proportions reveal and what to shift.

summary: 2–3 sentences — the essay's main strength and its single biggest problem.

suggestions: 3–6 concrete revisions, ordered by how much they would improve the essay. priority is "high", "medium", or "low". title is an imperative under 10 words. detail explains what to change and why, specifically for this essay. quote is a short verbatim excerpt (5–20 words, copied exactly) marking where to make the change.`
}

export function evaluateUser(req: EvaluateRequest) {
  const essay = req.paragraphs.map((p, i) => `[P${i + 1}] ${p}`).join('\n\n')
  const share = Object.entries(req.roleShare)
    .map(([role, v]) => `${role} ${Math.round((v ?? 0) * 100)}%`)
    .join(', ')
  return `<essay title="${req.title.replace(/"/g, "'")}">
${essay}
</essay>

Word share by role: ${share || 'unavailable'}`
}

export function normalizeEvaluation(r: z.infer<typeof Evaluation>, req: EvaluateRequest): EvaluateResponse {
  const known = new Set(getGenre(req.genre).rubric.map((c) => c.id))
  return {
    overall: clamp(r.overall, 0, 100),
    summary: r.summary,
    rubric: r.rubric.filter((c) => known.has(c.id)).map((c) => ({ ...c, score: clamp(c.score, 0, 10) })),
    balance: r.balance,
    suggestions: r.suggestions.map((s) => ({
      ...s,
      priority: s.priority === 'high' || s.priority === 'low' ? s.priority : 'medium',
    })),
  }
}
