// Instant, local estimates. These drive the highlights while Claude is still
// thinking (and entirely when no LLM is configured), so they must be cheap
// enough to run on every keystroke for a 2,000-word document.

import type { RoleId, RoleSegment, SentenceScores } from '../../shared/genres'

const words = (s: string) => s.toLowerCase().match(/[a-z']+/g) ?? []

const STAKES = new Set(
  'must never always crisis risk danger threat lose loss lost cost costs harm fail failure survive death die dying future collapse urgent critical destroy ruin stake stakes jobs lives million billion everyone nobody catastrophe irreversible'.split(' '),
)
const UNCERTAIN = new Set(
  'why how what whether if unless unknown unclear perhaps maybe might could question doubt yet puzzle mystery problem paradox'.split(' '),
)
const TURN = new Set('but however yet actually instead although though surprisingly ironically paradoxically contrary opposite wrong myth'.split(' '))
const FILLER = new Set(
  'very really quite rather just basically actually literally simply somewhat fairly pretty totally truly definitely certainly obviously clearly thing things stuff kind sort lot'.split(' '),
)
const NEG = new Set(
  'bad worse worst fail failure loss lose lost harm hurt fear afraid anger angry sad crisis threat danger wrong broken collapse decline problem pain poor lonely toxic'.split(' '),
)
const POS = new Set(
  'good better best win success gain hope free freedom joy happy thrive growth improve strong healthy love trust opportunity benefit progress flourish'.split(' '),
)
const HEDGES = [/\bit is (important|worth noting|clear) (to note )?that\b/i, /\bin order to\b/i, /\bthe fact that\b/i, /\bat the end of the day\b/i, /\bit (seems|appears) that\b/i]

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n))
const rate = (ws: string[], set: Set<string>) => ws.filter((w) => set.has(w)).length

export function heuristicScores(text: string): SentenceScores {
  const ws = words(text)
  const n = Math.max(ws.length, 1)
  const question = /\?\s*$/.test(text)
  const exclaim = /!\s*$/.test(text)

  const stakes = clamp(rate(ws, STAKES) * 0.22 + (exclaim ? 0.15 : 0) + (/\d/.test(text) ? 0.08 : 0))
  const uncertainty = clamp((question ? 0.55 : 0) + rate(ws, UNCERTAIN) * 0.12)
  const surprise = clamp(rate(ws, TURN) * 0.25 + (n <= 6 ? 0.15 : 0))
  // Short sentences read fast; long ones slow the reader down. Smooth curve, no ceiling:
  // 4 words ≈ 0.8, 12 ≈ 0.5, 25 ≈ 0.27.
  const pace = 1 / (1 + Math.pow(n / 12, 1.3))
  const padding = rate(ws, FILLER) / n + HEDGES.filter((r) => r.test(text)).length * 0.12 + (n > 35 ? 0.15 : 0)
  const density = clamp(1 - padding * 2.2)
  const valence = clamp((rate(ws, POS) - rate(ws, NEG)) * 0.3, -1, 1)

  return { stakes, uncertainty, surprise, pace, density, valence }
}

const CUES: [RegExp, RoleId][] = [
  [/\b(in conclusion|ultimately|in the end|that is why|this is why|so the question|in short)\b/i, 'link'],
  [/\b(critics|opponents|skeptics|some (argue|say|claim|believe)|others (argue|say)|it is often said|one might (argue|object))\b/i, 'counter'],
  [/\b(but this|yet this|this ignores|this misses|that argument|this objection|true, but|granted)\b/i, 'rebuttal'],
  [/\b(for example|for instance|according to|a study|studies|research|data|survey|report(ed)?|percent|%|\d{2,})\b/i, 'evidence'],
  [/\b(this (means|shows|suggests)|because|therefore|which (means|is why)|in other words|as a result)\b/i, 'analysis'],
]

/**
 * Rough whole-sentence role guess from cue phrases and position: the thesis
 * usually closes the opening paragraph, and later paragraphs open on a point.
 */
export function heuristicRoles(text: string, index: number, count: number, paraIndex: number): RoleSegment[] {
  // Strength reflects how sure the guess is: an explicit cue beats position,
  // and the fallback stays below the default threshold so it isn't painted.
  for (const [re, role] of CUES) if (re.test(text)) return [{ text, role, strength: 0.7 }]
  if (paraIndex === 0 && index === count - 1) return [{ text, role: 'thesis', strength: 0.55 }]
  if (paraIndex > 0 && index === 0) return [{ text, role: 'point', strength: 0.55 }]
  return [{ text, role: 'analysis', strength: 0.3 }]
}
