// Splits the ProseMirror document into paragraphs and sentences, keeping a map
// from string offsets back to document positions so highlights land exactly.

import type { Node as PMNode } from '@tiptap/pm/model'

export interface Sentence {
  /** Hash of the sentence text — the analysis cache key. Stable across edits elsewhere. */
  hash: string
  text: string
  from: number
  to: number
  /** Doc position of each character of `text` (handles marks and inline nodes). */
  pos: number[]
  para: number
  /** Index within its paragraph. */
  index: number
}

export interface Paragraph {
  text: string
  sentences: Sentence[]
}

export interface Segmentation {
  paragraphs: Paragraph[]
  sentences: Sentence[]
}

const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })

// FNV-1a — fast, and collisions only cost a stale highlight, never correctness of the doc.
export function hashText(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export function segmentDoc(doc: PMNode): Segmentation {
  const paragraphs: Paragraph[] = []
  const sentences: Sentence[] = []

  doc.descendants((node, nodePos) => {
    if (!node.isTextblock) return true
    // Headings are labels, not prose; the title reaches the model separately.
    if (node.type.name === 'heading') return false
    let text = ''
    const pos: number[] = []
    node.forEach((child, offset) => {
      const start = nodePos + 1 + offset
      if (child.isText) {
        const t = child.text ?? ''
        for (let i = 0; i < t.length; i++) pos.push(start + i)
        text += t
      } else {
        // Hard breaks and other inline leaves: treat as a space so sentences don't fuse.
        pos.push(start)
        text += ' '
      }
    })

    const para: Paragraph = { text: text.trim(), sentences: [] }
    if (para.text) {
      const paraIndex = paragraphs.length
      for (const { segment, index } of segmenter.segment(text)) {
        const lead = segment.length - segment.trimStart().length
        const trimmed = segment.trim()
        if (!trimmed) continue
        const a = index + lead
        const b = a + trimmed.length
        const s: Sentence = {
          hash: hashText(trimmed),
          text: trimmed,
          from: pos[a],
          to: pos[b - 1] + 1,
          pos: pos.slice(a, b),
          para: paraIndex,
          index: para.sentences.length,
        }
        para.sentences.push(s)
        sentences.push(s)
      }
      paragraphs.push(para)
    }
    return false
  })

  return { paragraphs, sentences }
}

/** Locate each role segment inside its sentence; unmatched segments are dropped. */
export function locateSegments<T extends { text: string }>(sentence: string, segments: T[]): (T & { start: number; end: number })[] {
  const out: (T & { start: number; end: number })[] = []
  const lower = sentence.toLowerCase()
  let cursor = 0
  for (const seg of segments) {
    const needle = seg.text.trim()
    if (!needle) continue
    let at = sentence.indexOf(needle, cursor)
    if (at < 0) at = lower.indexOf(needle.toLowerCase(), cursor)
    if (at < 0) continue
    out.push({ ...seg, start: at, end: at + needle.length })
    cursor = at + needle.length
  }
  return out
}

// Length-preserving, so indexes still line up with the position map.
const fold = (s: string) => s.replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s/g, ' ').toLowerCase()

/**
 * Find a quoted excerpt in the document (quotes from the model may differ in
 * curly quotes, spacing, or case). Falls back to the excerpt's first words.
 */
export function findInDoc(doc: PMNode, quote: string, within?: { from: number; to: number }): { from: number; to: number } | null {
  const blocks: { text: string; pos: number[] }[] = []
  doc.descendants((node, nodePos) => {
    if (!node.isTextblock) return true
    // Optionally search only blocks overlapping a range (e.g. one paragraph).
    if (within && (nodePos + node.nodeSize <= within.from || nodePos >= within.to)) return false
    let text = ''
    const pos: number[] = []
    node.forEach((child, offset) => {
      const t = child.isText ? (child.text ?? '') : ' '
      for (let i = 0; i < t.length; i++) pos.push(nodePos + 1 + offset + i)
      text += t
    })
    blocks.push({ text: fold(text), pos })
    return false
  })
  const words = fold(quote).trim().split(/\s+/)
  const needles = [words.join(' '), words.slice(0, 6).join(' ')]
  for (const needle of needles) {
    if (needle.length < 4) continue
    for (const b of blocks) {
      const at = b.text.indexOf(needle)
      if (at >= 0 && b.pos[at + needle.length - 1] !== undefined) return { from: b.pos[at], to: b.pos[at + needle.length - 1] + 1 }
    }
  }
  return null
}
