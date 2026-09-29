// Turns comments from the model (paragraph index + quoted text) into anchored
// comments with document positions, dropping any whose text can't be found.

import type { Node as PMNode } from '@tiptap/pm/model'
import type { DraftComment } from '../../shared/comments'
import { findInDoc, type Segmentation } from '../analysis/segment'
import type { Comment } from './plugin'

const PRIORITY = { high: 0, medium: 1, low: 2 }
let seq = 0

export function placeComments(doc: PMNode, seg: Segmentation, drafts: DraftComment[], by: string): Comment[] {
  const out: Comment[] = []
  for (const d of drafts) {
    const para = seg.paragraphs[d.paragraph]
    const range = para?.sentences.length ? { from: para.sentences[0].from, to: para.sentences[para.sentences.length - 1].to } : undefined
    let at: { from: number; to: number } | null
    if (d.scope === 'paragraph' && range) at = range
    else at = (range && findInDoc(doc, d.quote, range)) || findInDoc(doc, d.quote)
    if (!at) continue
    out.push({ ...d, id: `c${Date.now().toString(36)}${(seq++).toString(36)}`, from: at.from, to: at.to, by })
  }
  // Higher-order and higher-priority first, then in reading order.
  return out.sort((a, b) => PRIORITY[a.priority] - PRIORITY[b.priority] || a.from - b.from)
}

/** Ask for fewer comments by default: prioritized feedback helps writers more. */
export function commentBudget(words: number, amount: 'focused' | 'thorough') {
  return amount === 'focused' ? Math.min(10, Math.max(4, Math.round(words / 200))) : Math.min(25, Math.max(8, Math.round(words / 80)))
}
