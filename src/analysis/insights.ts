// Turns the Score tab's charts into feedback: what the pattern means for this
// essay, and the next concrete step (feed-forward), with where to act.

import type { CommentCategoryId } from '../../shared/comments'
import { getGenre, type SegmentRole } from '../../shared/genres'
import { resolveSentence } from './highlight'
import type { Segmentation } from './segment'

export type Metric = 'tension' | 'looseness' | 'pace'

export interface Insight {
  /** What the chart shows, in one sentence. */
  meaning: string
  /** The next step. */
  next: string
  tone: 'good' | 'warn'
  /** Paragraph to jump to, if the next step is local. */
  paragraph?: number
  /** Comment category to surface, if comments can help. */
  category?: CommentCategoryId
}

export interface ParagraphSeries {
  metric: Metric
  values: number[]
  /** Paragraph start positions, for jumping. */
  starts: number[]
}

export function paragraphSeries(seg: Segmentation, metric: Metric): ParagraphSeries {
  const values = seg.paragraphs.map((p) => {
    if (!p.sentences.length) return 0
    const rs = p.sentences.map((s) => resolveSentence(s, seg).scores)
    if (metric === 'tension') return rs.reduce((a, r) => a + (r.stakes + r.uncertainty + r.surprise) / 3, 0) / rs.length
    // Share of sentences that read as loose, so "3 of 5 sentences" is literal.
    if (metric === 'looseness') return rs.filter((r) => r.density < 0.5).length / rs.length
    return rs.reduce((a, r) => a + r.pace, 0) / rs.length
  })
  return { metric, values, starts: seg.paragraphs.map((p) => p.sentences[0]?.from ?? 0) }
}

const argmax = (xs: number[]) => xs.reduce((best, x, i) => (x > xs[best] ? i : best), 0)
const argmin = (xs: number[]) => xs.reduce((best, x, i) => (x < xs[best] ? i : best), 0)

export function seriesInsight(series: ParagraphSeries, seg: Segmentation): Insight {
  const v = series.values
  const n = v.length
  if (n < 3) return { meaning: 'Too few paragraphs to read a pattern yet.', next: 'Keep writing; the pattern appears at three or more paragraphs.', tone: 'good' }

  if (series.metric === 'tension') {
    const peak = argmax(v)
    const spread = Math.max(...v) - Math.min(...v)
    if (spread < 0.08) {
      const target = Math.min(1, n - 1)
      return {
        meaning: 'Tension is flat — every paragraph sits at about the same level, so nothing pulls the reader forward.',
        next: `Open a question the essay will answer, or make a counter-intuitive claim, early — P${target + 1} is a good place.`,
        tone: 'warn',
        paragraph: target,
        category: 'argument',
      }
    }
    if (peak < Math.floor(n / 2)) {
      const late = n - 2
      return {
        meaning: `Tension peaks early (P${peak + 1} of ${n}) and fades, so the ending has less at stake than the opening.`,
        next: `Save your sharpest turn or strongest evidence for later, or raise the stakes in P${late + 1}.`,
        tone: 'warn',
        paragraph: late,
        category: 'structure',
      }
    }
    return {
      meaning: `Tension builds to a peak in P${peak + 1} of ${n} — a well-placed arc.`,
      next: `Make sure the paragraphs after the peak resolve it rather than restate it.`,
      tone: 'good',
      paragraph: Math.min(peak + 1, n - 1),
    }
  }

  if (series.metric === 'looseness') {
    const worst = argmax(v)
    const sentences = seg.paragraphs[worst].sentences.length
    const loose = Math.round(v[worst] * sentences)
    if (v[worst] < 0.3) {
      return { meaning: 'The prose is consistently tight — no paragraph is padded.', next: 'Keep sentences this lean as you revise.', tone: 'good' }
    }
    return {
      meaning: `P${worst + 1} is the loosest: ${loose} of ${sentences} sentences carry filler, hedging, or repetition.`,
      next: `Tighten P${worst + 1} first — cut hedges and filler words, and merge sentences that repeat a point.`,
      tone: 'warn',
      paragraph: worst,
      category: 'concision',
    }
  }

  const slow = argmin(v)
  const mean = v.reduce((a, b) => a + b, 0) / n
  if (v[slow] > mean - 0.12) {
    return { meaning: 'The pace is even across paragraphs.', next: 'Vary it on purpose: a short, blunt sentence after a long one lands harder.', tone: 'good' }
  }
  return {
    meaning: `P${slow + 1} drags: its sentences are long and qualified compared with the rest.`,
    next: `In P${slow + 1}, lead with the claim and split the longest sentence.`,
    tone: 'warn',
    paragraph: slow,
    category: 'clarity',
  }
}

/** The single most useful thing the role balance says. */
export function balanceInsight(genreId: string, share: Partial<Record<SegmentRole, number>>, seg: Segmentation): Insight {
  const bands = getGenre(genreId).balance
  const off = (Object.entries(bands) as [SegmentRole, [number, number]][])
    .map(([role, [lo, hi]]) => {
      const v = share[role] ?? 0
      return { role, v, lo, hi, gap: v < lo ? (lo - v) / lo : v > hi ? (v - hi) / hi : 0 }
    })
    .filter((x) => x.gap > 0)
    .sort((a, b) => b.gap - a.gap)[0]
  if (!off) return { meaning: 'The balance of claims, evidence, and analysis is within typical ranges.', next: 'Check the comments for how well each part works.', tone: 'good' }

  const pct = (x: number) => `${Math.round(x * 100)}%`
  const role = off.role
  const low = off.v < off.lo
  const bodyWithout = seg.paragraphs.findIndex((p, i) => i > 0 && i < seg.paragraphs.length - 1 && !p.sentences.some((s) => resolveSentence(s, seg).segments.some((x) => x.role === 'evidence' && x.strength > 0)))
  const texts: Partial<Record<SegmentRole, { low: string; high: string }>> = {
    evidence: { low: 'Claims outrun their support.', high: 'Evidence piles up without enough explanation of why it matters.' },
    analysis: { low: 'Evidence is presented but rarely explained.', high: 'Much of the essay explains and restates rather than showing.' },
    counter: { low: 'The essay barely engages the other side.', high: 'Opposing views take up a lot of room.' },
    rebuttal: { low: 'Objections are raised but not answered.', high: 'Rebuttal dominates the argument.' },
    point: { low: 'Paragraphs lack clear topic claims.', high: 'Many claims, little development.' },
    thesis: { low: 'The central claim is hard to find.', high: 'The thesis is restated often.' },
    link: { low: 'Paragraphs rarely connect back to the thesis.', high: 'Much text is spent on transitions and wrap-ups.' },
    none: { low: '', high: 'A share of the text does no argumentative work.' },
  }
  const nexts: Partial<Record<SegmentRole, { low: string; high: string }>> = {
    evidence: { low: `Add a concrete example, figure, or quotation${bodyWithout > 0 ? ` in P${bodyWithout + 1}` : ''}.`, high: 'After each piece of evidence, add a sentence on what it proves.' },
    analysis: { low: 'After each example, add one sentence saying how it supports your point.', high: 'Replace a restating sentence with a specific example.' },
    counter: { low: 'State the strongest opposing view fairly in one or two sentences.', high: 'Compress the opposing view to its strongest form.' },
    rebuttal: { low: 'Answer the objection you raised — concede what is true, then show why your claim still holds.', high: 'Tighten the rebuttal to its decisive point.' },
    point: { low: 'Open each body paragraph with the claim it will prove.', high: 'Merge thin claims and develop the strongest ones.' },
    thesis: { low: 'State your position in one arguable sentence at the end of the introduction.', high: 'Say the thesis once, then build on it instead of repeating it.' },
    link: { low: 'End body paragraphs by tying them back to the thesis.', high: 'Cut summary sentences that only repeat.' },
    none: { low: '', high: 'Cut or repurpose sentences that do no work — see the Concision comments.' },
  }
  const label = role === 'none' ? 'Text with no clear role' : getGenre(genreId).roles.find((r) => r.id === role)?.label ?? role
  return {
    meaning: `${label} is ${pct(off.v)} of the words (typical ${pct(off.lo)}–${pct(off.hi)}). ${(low ? texts[role]?.low : texts[role]?.high) ?? ''}`.trim(),
    next: (low ? nexts[role]?.low : nexts[role]?.high) ?? '',
    tone: 'warn',
    paragraph: role === 'evidence' && low && bodyWithout > 0 ? bodyWithout : undefined,
    category: role === 'none' ? 'concision' : 'argument',
  }
}
