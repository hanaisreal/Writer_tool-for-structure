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
import { COMMENT_CATEGORIES, COMMENT_CATEGORY_IDS, type CommentCategoryId, type CommentsRequest, type CommentsResponse, type DraftComment } from './comments.ts'
import { getRubric } from './rubrics.ts'

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

// ---- Whole-essay evaluation (concise, rubric-based) ----

export const Evaluation = z.object({
  summary: z.string(),
  scores: z.array(z.object({ id: z.string(), score: z.number(), reason: z.string() })),
  nextSteps: z.array(z.object({ title: z.string(), detail: z.string(), quote: z.string() })),
})

const essayBlock = (title: string, paragraphs: string[]) =>
  `<essay title="${title.replace(/"/g, "'")}">
${paragraphs.map((p, i) => `[P${i + 1}] ${p}`).join('\n\n')}
</essay>`

export function evaluateSystem(req: EvaluateRequest) {
  const g = getGenre(req.genre)
  const r = getRubric(req.rubric)
  const criteria = r.criteria.map((c) => `- ${c.id} (${c.label}, ${c.min}–${c.max}): ${c.descriptor}`).join('\n')
  return `You are an experienced examiner grading a piece of writing against an established rubric: ${r.source}.

${g.framing}

Score each criterion on its own scale, as a trained examiner applying this rubric would — neither generous nor harsh. ${r.step < 1 ? 'Half points are allowed.' : 'Use whole numbers.'}
Criteria (use exactly these ids):
${criteria}

For each criterion, "reason" is one sentence (at most 20 words) naming the specific feature of this essay that decided the score.

summary: at most two sentences — the essay's main strength and its single biggest problem.

nextSteps: exactly three revisions that would raise the score most, highest impact first. Prioritize higher-order concerns (thesis, argument, structure) over sentence-level ones unless the latter truly dominate. title is an imperative under 10 words; detail says concretely what to change and why, for this essay; quote is a short verbatim excerpt (5–20 words, copied exactly) marking where to start.`
}

export function evaluateUser(req: EvaluateRequest) {
  return essayBlock(req.title, req.paragraphs)
}

export function normalizeEvaluation(r: z.infer<typeof Evaluation>, req: EvaluateRequest): EvaluateResponse {
  const rubric = getRubric(req.rubric)
  const byId = new Map(rubric.criteria.map((c) => [c.id, c]))
  return {
    rubric: rubric.id,
    summary: r.summary,
    scores: r.scores
      .filter((s) => byId.has(s.id))
      .map((s) => {
        const c = byId.get(s.id)!
        return { ...s, score: clamp(Math.round(s.score / rubric.step) * rubric.step, c.min, c.max) }
      }),
    nextSteps: r.nextSteps.slice(0, 3),
  }
}

// ---- Inline comments ----

export const Comments = z.object({
  comments: z.array(
    z.object({
      category: z.string(),
      scope: z.string(),
      priority: z.string(),
      paragraph: z.number(),
      quote: z.string(),
      message: z.string(),
      nextStep: z.string(),
      suggestion: z.string(),
    }),
  ),
})

export function commentsSystem(req: CommentsRequest) {
  const g = getGenre(req.genre)
  const cats = COMMENT_CATEGORIES.map((c) => `- ${c.id}: ${c.hint}`).join('\n')
  return `You are a writing tutor leaving margin comments on a draft, the way a skilled teacher would in a shared document.

${g.framing}

Leave at most ${req.maxComments} comments — fewer is better. Research on writing feedback finds that a few prioritized comments help writers far more than many; comment only where it would clearly change the draft, and skip anything minor. Address higher-order concerns (structure, argument) before sentence-level ones. Include one or two "praise" comments for things the writer should keep doing, if deserved.

Each comment:
- category (use exactly these ids):
${cats}
- scope: "word" for a word or short phrase, "sentence" for one sentence, "paragraph" for a whole paragraph.
- priority: "high", "medium", or "low".
- paragraph: the paragraph number shown as [P#], starting at 1.
- quote: the exact anchor text, copied verbatim from that paragraph — the word/phrase, the full sentence, or for paragraph scope the paragraph's first 6–10 words.
- message: one or two sentences — what you notice and why it matters to a reader. Specific to this text; never generic.
- nextStep: one sentence — the concrete thing to do next.
- suggestion: a drop-in replacement for the quote when a rewrite is the clearest help (word or sentence scope only); otherwise an empty string. Keep the writer's voice.`
}

export function commentsUser(req: CommentsRequest) {
  return essayBlock(req.title, req.paragraphs)
}

const PRIORITIES = ['high', 'medium', 'low'] as const
const SCOPES = ['word', 'sentence', 'paragraph'] as const

export function normalizeComments(r: z.infer<typeof Comments>, req: CommentsRequest): CommentsResponse {
  const comments: DraftComment[] = []
  for (const c of r.comments) {
    if (!(COMMENT_CATEGORY_IDS as string[]).includes(c.category) || !c.quote.trim() || !c.message.trim()) continue
    const scope = (SCOPES as readonly string[]).includes(c.scope) ? (c.scope as DraftComment['scope']) : 'sentence'
    comments.push({
      category: c.category as CommentCategoryId,
      scope,
      priority: (PRIORITIES as readonly string[]).includes(c.priority) ? (c.priority as DraftComment['priority']) : 'medium',
      paragraph: clamp(Math.round(c.paragraph) - 1, 0, Math.max(0, req.paragraphs.length - 1)),
      quote: c.quote.trim(),
      message: c.message.trim(),
      nextStep: c.nextStep.trim(),
      suggestion: scope === 'paragraph' ? '' : c.suggestion.trim(),
    })
  }
  return { comments: comments.slice(0, req.maxComments) }
}
