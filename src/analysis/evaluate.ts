// Whole-document measurements for the Score tab, computed locally from the
// same per-sentence results the highlights use — instant, no model call.

import type { SegmentRole } from '../../shared/genres'
import { resolveSentence, type Resolved } from './highlight'
import { locateSegments, type Segmentation, type Sentence } from './segment'

export interface Check {
  id: string
  label: string
  /** null = not applicable (e.g. too few paragraphs). */
  pass: boolean | null
  detail: string
  /** Where to jump for a failing check. */
  at?: { from: number; to: number }
}

export interface LocalReport {
  words: number
  sentences: number
  paragraphs: number
  /** Share of words (0..1) per role, including 'none' for text with no job. */
  roleShare: Partial<Record<SegmentRole, number>>
  /** Mean of stakes, uncertainty and surprise per paragraph (0..1). */
  paraTension: { value: number; from: number }[]
  checks: Check[]
  /** How many sentences have Claude results (vs local estimates). */
  fromClaude: number
}

const wordCount = (t: string) => t.split(/\s+/).filter(Boolean).length
const hasRole = (r: Resolved, role: SegmentRole) => r.segments.some((s) => s.role === role && s.strength > 0)
const span = (s: Sentence) => ({ from: s.from, to: s.to })

export function localReport(seg: Segmentation): LocalReport {
  const resolved = new Map(seg.sentences.map((s) => [s, resolveSentence(s, seg)] as const))
  const roleWords: Partial<Record<SegmentRole, number>> = {}
  let words = 0

  for (const [s, r] of resolved) {
    const total = wordCount(s.text)
    words += total
    let covered = 0
    for (const part of locateSegments(s.text, r.segments)) {
      const n = wordCount(part.text)
      covered += n
      roleWords[part.role] = (roleWords[part.role] ?? 0) + n
    }
    // Words the model didn't assign to any span count as having no job.
    if (total > covered) roleWords.none = (roleWords.none ?? 0) + (total - covered)
  }
  const roleShare = Object.fromEntries(Object.entries(roleWords).map(([k, v]) => [k, words ? v / words : 0])) as LocalReport['roleShare']

  const paras = seg.paragraphs.map((p) => p.sentences.map((s) => ({ s, r: resolved.get(s)! })))
  const paraTension = paras.map((ss) => ({
    value: ss.length ? ss.reduce((acc, { r }) => acc + (r.scores.stakes + r.scores.uncertainty + r.scores.surprise) / 3, 0) / ss.length : 0,
    from: ss[0]?.s.from ?? 0,
  }))

  const n = paras.length
  const body = paras.slice(1, -1)
  const checks: Check[] = []

  const thesis = paras.slice(0, 2).flat().find(({ r }) => hasRole(r, 'thesis'))
  checks.push({
    id: 'thesis',
    label: 'Thesis stated up front',
    pass: n ? Boolean(thesis) : null,
    detail: thesis ? 'The opening states the central claim.' : 'No clear thesis in the first two paragraphs.',
    at: paras[0]?.[0] ? span(paras[0][0].s) : undefined,
  })

  if (body.length) {
    const noPoint = body.filter((ss) => !ss.slice(0, 2).some(({ r }) => hasRole(r, 'point')))
    checks.push({
      id: 'points',
      label: 'Each body paragraph makes a point',
      pass: noPoint.length === 0,
      detail: noPoint.length ? `${noPoint.length} of ${body.length} body paragraphs open without a clear point.` : 'Every body paragraph opens on a claim.',
      at: noPoint[0]?.[0] ? span(noPoint[0][0].s) : undefined,
    })
    const withEvidence = body.filter((ss) => ss.some(({ r }) => hasRole(r, 'evidence')))
    const lacking = body.find((ss) => !ss.some(({ r }) => hasRole(r, 'evidence')))
    checks.push({
      id: 'evidence',
      label: 'Claims are backed by evidence',
      pass: withEvidence.length >= Math.ceil(body.length / 2),
      detail: `${withEvidence.length} of ${body.length} body paragraphs contain evidence.`,
      at: lacking?.[0] ? span(lacking[0].s) : undefined,
    })
  } else {
    checks.push({ id: 'points', label: 'Each body paragraph makes a point', pass: null, detail: 'Needs at least three paragraphs.' })
    checks.push({ id: 'evidence', label: 'Claims are backed by evidence', pass: null, detail: 'Needs at least three paragraphs.' })
  }

  const flat = paras.flat()
  const counterAt = flat.findIndex(({ r }) => hasRole(r, 'counter'))
  const rebutted = counterAt >= 0 && flat.slice(counterAt).some(({ r }) => hasRole(r, 'rebuttal'))
  checks.push({
    id: 'counter',
    label: 'Opposing view raised and answered',
    pass: counterAt >= 0 && rebutted,
    detail: counterAt < 0 ? 'No counterargument — the essay never tests itself.' : rebutted ? 'A counterargument is raised and rebutted.' : 'A counterargument is raised but never answered.',
    at: counterAt >= 0 ? span(flat[counterAt].s) : undefined,
  })

  const last = paras[n - 1]
  const linked = n > 1 && last.some(({ r }) => hasRole(r, 'link'))
  checks.push({
    id: 'conclusion',
    label: 'Ending ties back to the thesis',
    pass: n > 1 ? linked : null,
    detail: n < 2 ? 'Needs at least two paragraphs.' : linked ? 'The last paragraph links back.' : 'The last paragraph doesn’t connect back to the thesis.',
    at: last?.[0] ? span(last[0].s) : undefined,
  })

  const loose = flat.filter(({ r }) => r.scores.density < 0.5)
  const looseShare = flat.length ? loose.length / flat.length : 0
  checks.push({
    id: 'tight',
    label: 'Prose is tight',
    pass: looseShare <= 0.2,
    detail: `${loose.length} of ${flat.length} sentences read as loose (${Math.round(looseShare * 100)}%; aim for ≤ 20%).`,
    at: loose[0] ? span(loose[0].s) : undefined,
  })

  const lengths = flat.map(({ s }) => wordCount(s.text))
  const mean = lengths.reduce((a, b) => a + b, 0) / (lengths.length || 1)
  const sd = Math.sqrt(lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / (lengths.length || 1))
  checks.push({
    id: 'rhythm',
    label: 'Sentence rhythm varies',
    pass: lengths.length > 3 ? sd >= 5 : null,
    detail: `Sentence lengths vary by ±${sd.toFixed(1)} words around ${mean.toFixed(0)} (aim for ≥ ±5).`,
  })

  let peak = 0
  paraTension.forEach((p, i) => p.value > paraTension[peak].value && (peak = i))
  checks.push({
    id: 'arc',
    label: 'Tension builds toward a late peak',
    pass: n >= 3 ? peak >= Math.floor(n / 2) : null,
    detail: n < 3 ? 'Needs at least three paragraphs.' : `Tension peaks in paragraph ${peak + 1} of ${n}.`,
    at: paras[peak]?.[0] ? span(paras[peak][0].s) : undefined,
  })

  return {
    words,
    sentences: flat.length,
    paragraphs: n,
    roleShare,
    paraTension,
    checks,
    fromClaude: flat.filter(({ r }) => r.source === 'claude').length,
  }
}
