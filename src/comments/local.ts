// Rule-based comments for writers without an API key: a handful of reliable
// concision and clarity checks. Deliberately narrow — rules can't judge
// argument or structure, and a few accurate comments beat many noisy ones.

import type { DraftComment } from '../../shared/comments'
import type { Segmentation } from '../analysis/segment'

const PHRASES: { re: RegExp; message: string; nextStep: string; suggestion: (m: string) => string }[] = [
  { re: /\bin order to\b/i, message: '“In order to” adds two words and no meaning.', nextStep: 'Use “to”.', suggestion: () => 'to' },
  { re: /\bdue to the fact that\b/i, message: 'A long way of saying “because”.', nextStep: 'Use “because”.', suggestion: () => 'because' },
  { re: /\bthe fact that\b/i, message: '“The fact that” usually pads a sentence.', nextStep: 'Rephrase around the fact itself.', suggestion: () => '' },
  { re: /\bit is (important|worth noting|clear) (to note )?that\b/i, message: 'Throat-clearing: this announces a point instead of making it.', nextStep: 'Delete it and start with the point.', suggestion: () => '' },
  { re: /\bat the end of the day\b/i, message: 'A cliché that softens your claim.', nextStep: 'Cut it or say “ultimately”.', suggestion: () => 'ultimately' },
  { re: /\bI (think|believe|feel) that\b/i, message: 'Hedging weakens a claim the essay is already making.', nextStep: 'State the claim directly.', suggestion: () => '' },
  // "the very skills" means "exactly those", not an intensifier.
  { re: /(?<!\bthe )\b(very|really|extremely) (\w+)/i, message: 'An intensifier stands in for a stronger word.', nextStep: 'Replace both words with one precise one.', suggestion: () => '' },
  { re: /\b(basically|literally|actually|simply|totally)\b/i, message: 'A filler word that adds no meaning here.', nextStep: 'Delete it.', suggestion: () => '' },
]

export function localComments(seg: Segmentation, max: number): DraftComment[] {
  const out: DraftComment[] = []
  seg.paragraphs.forEach((p, paragraph) => {
    for (const s of p.sentences) {
      const words = s.text.split(/\s+/).filter(Boolean).length
      if (words > 38) {
        out.push({
          category: 'clarity',
          scope: 'sentence',
          priority: words > 50 ? 'high' : 'medium',
          paragraph,
          quote: s.text,
          message: `At ${words} words, this sentence asks the reader to hold a lot at once.`,
          nextStep: 'Split it where the idea turns, and lead with the main claim.',
          suggestion: '',
        })
      }
      for (const rule of PHRASES) {
        const m = s.text.match(rule.re)
        if (!m) continue
        out.push({
          category: 'concision',
          scope: 'word',
          priority: 'low',
          paragraph,
          quote: m[0],
          message: rule.message,
          nextStep: rule.nextStep,
          suggestion: rule.suggestion(m[0]),
        })
      }
    }
  })
  // Long sentences first; then spread phrase comments across the essay.
  return out.sort((a, b) => (a.priority === b.priority ? a.paragraph - b.paragraph : a.priority === 'high' ? -1 : b.priority === 'high' ? 1 : a.priority === 'medium' ? -1 : 1)).slice(0, max)
}
