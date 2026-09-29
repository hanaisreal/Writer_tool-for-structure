// Tiptap extension that paints analysis results behind the text as
// ProseMirror decorations. Decorations are view-only: they never enter the
// document, undo history, or the user's own highlight marks.

import { Extension } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { getGenre, type AxisDef, type AxisId, type RoleSegment, type SentenceScores } from '../../shared/genres'
import { heuristicRoles, heuristicScores } from './heuristics'
import { getPalette, maxAlpha, tint } from './palettes'
import { locateSegments, segmentDoc, type Segmentation, type Sentence } from './segment'
import { store, type ViewSettings } from './store'

interface HighlightState {
  seg: Segmentation
  deco: DecorationSet
}

export const highlightKey = new PluginKey<HighlightState>('tensionHighlight')

export interface Resolved {
  scores: SentenceScores
  segments: RoleSegment[]
  note: string
  /** True while showing the local estimate and Claude's answer is still expected. */
  pending: boolean
  source: 'claude' | 'estimate'
}

export function resolveSentence(s: Sentence, seg: Segmentation): Resolved {
  const r = store.getResult(s.hash)
  if (r) return { ...r, pending: false, source: 'claude' }
  const count = seg.paragraphs[s.para]?.sentences.length ?? 1
  return {
    scores: heuristicScores(s.text),
    segments: heuristicRoles(s.text, s.index, count, s.para),
    note: '',
    pending: store.getSnapshot().status.llm === 'ready',
    source: 'estimate',
  }
}

/** Intensity 0..1 of one axis for a sentence, and the palette color to paint it with. */
export function axisIntensity(axis: AxisDef, scores: SentenceScores): { value: number; color: string } {
  const p = getPalette(store.getSnapshot().view.palette)
  const v = scores[axis.id]
  if (axis.negColor) return { value: Math.abs(v), color: v < 0 ? p.valenceNeg : p.axes[axis.id] }
  return { value: axis.invert ? 1 - v : v, color: p.axes[axis.id] }
}

export function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha.toFixed(3)})`
}

/** Per-axis sorted intensities across the document, for relative shading. */
export type AxisRanks = Partial<Record<AxisId, number[]>>

export function axisRanks(axes: AxisDef[], all: Resolved[]): AxisRanks {
  const out: AxisRanks = {}
  for (const a of axes) out[a.id] = all.map((r) => axisIntensity(a, r.scores).value).sort((x, y) => x - y)
  return out
}

/**
 * Percentile of `value` within the document (0 = weakest sentence, 1 = strongest),
 * so shading spreads across the whole range even when raw scores cluster.
 * Falls back to the absolute value when the document is too flat to rank meaningfully.
 */
export function relativeValue(value: number, sorted: number[] | undefined) {
  if (!sorted || sorted.length < 3 || sorted[sorted.length - 1] - sorted[0] < 0.08) return value
  let below = 0
  let equal = 0
  for (const v of sorted) {
    if (v < value - 1e-9) below++
    else if (Math.abs(v - value) <= 1e-9) equal++
  }
  return (below + Math.max(0, equal - 1) / 2) / (sorted.length - 1)
}

/**
 * One solid fill per sentence: the strongest of the enabled axes. Stacking
 * several axes as bands inside a line made the top band read as belonging to
 * the line above, so a sentence carries exactly one color.
 */
function tensionFill(r: Resolved, view: ViewSettings, ranks: AxisRanks): { color: string; alpha: number; title: string } | null {
  let best: { label: string; level: number; raw: number; color: string } | null = null
  for (const a of getGenre(view.genre).axes) {
    if (!view.axes[a.id]) continue
    const { value, color } = axisIntensity(a, r.scores)
    const level = view.relative ? relativeValue(value, ranks[a.id]) : value
    if (!best || level > best.level) best = { label: a.invert ? 'Looseness' : a.label, level, raw: value, color }
  }
  // Unpainted by default: only sentences past the threshold get a highlight.
  if (!best || best.level < view.threshold) return null
  // Among highlighted sentences, stronger ones are darker — within this color's
  // readability cap, so no pack can bury the text.
  const t = view.threshold >= 1 ? 1 : (best.level - view.threshold) / (1 - view.threshold)
  const cap = maxAlpha(best.color)
  const alpha = Math.min(cap, cap * (0.45 + 0.55 * t) * view.strength)
  return { color: best.color, alpha, title: `${best.label} ${Math.round(best.raw * 100)}` }
}

/** What to paint, independent of how: the editor turns these into decorations, exports into styled runs. */
export type Paint =
  | { kind: 'fill'; from: number; to: number; color: string; alpha: number; title: string; pending: boolean; role: boolean }
  | { kind: 'tag'; pos: number; label: string; tag: string; color: string; id: string }

export function computePaint(seg: Segmentation): Paint[] {
  const { view } = store.getSnapshot()
  if (view.mode === 'off') return []
  const genre = getGenre(view.genre)
  const palette = getPalette(view.palette)
  const resolved = seg.sentences.map((s) => resolveSentence(s, seg))
  const ranks = view.mode === 'tension' && view.relative ? axisRanks(genre.axes, resolved) : {}
  const out: Paint[] = []

  seg.sentences.forEach((s, i) => {
    const r = resolved[i]
    if (view.mode === 'tension') {
      const fill = tensionFill(r, view, ranks)
      if (fill) out.push({ kind: 'fill', from: s.from, to: s.to, ...fill, pending: r.pending, role: false })
      return
    }
    for (const part of locateSegments(s.text, r.segments)) {
      // 'none' spans and roles done too weakly stay unpainted.
      const role = genre.roles.find((x) => x.id === part.role)
      if (!role || !view.roles[role.id] || part.strength < view.roleThreshold) continue
      const from = s.pos[part.start]
      const to = s.pos[part.end - 1] + 1
      const color = palette.roles[role.id]
      const alpha = maxAlpha(color) * (0.55 + 0.45 * part.strength) * view.strength
      out.push({ kind: 'fill', from, to, color, alpha, title: `${role.label} · strength ${Math.round(part.strength * 100)}`, pending: r.pending, role: true })
      if (view.showTags) out.push({ kind: 'tag', pos: from, label: role.label, tag: role.tag, color, id: role.id })
    }
  })
  return out
}

/** Legend entries (colors as opaque tints) for what is currently painted, for printouts and exports. */
export function currentLegend(): { title: string; items: { label: string; color: string }[] } | null {
  const { view } = store.getSnapshot()
  if (view.mode === 'off') return null
  const genre = getGenre(view.genre)
  const palette = getPalette(view.palette)
  if (view.mode === 'argument') {
    return { title: 'Argument roles', items: genre.roles.filter((r) => view.roles[r.id]).map((r) => ({ label: `${r.label} (${r.tag})`, color: tint(palette.roles[r.id]) })) }
  }
  const items = genre.axes
    .filter((a) => view.axes[a.id])
    .flatMap((a) =>
      a.negColor
        ? [
            { label: `${a.label} −`, color: tint(palette.valenceNeg) },
            { label: `${a.label} +`, color: tint(palette.axes[a.id]) },
          ]
        : [{ label: a.invert ? 'Looseness (low density)' : a.label, color: tint(palette.axes[a.id]) }],
    )
  return { title: `Tension${view.relative ? ' — darker = stronger within this document' : ''}`, items }
}

function tagWidget(label: string, tag: string, color: string) {
  return () => {
    const el = document.createElement('span')
    el.className = 'tv-tag'
    el.textContent = tag
    el.title = label
    el.style.background = rgba(color, maxAlpha(color))
    el.style.borderColor = color
    el.contentEditable = 'false'
    return el
  }
}

function build(doc: EditorState['doc'], seg: Segmentation): DecorationSet {
  const decos = computePaint(seg).map((p) =>
    p.kind === 'fill'
      ? Decoration.inline(p.from, p.to, {
          style: `background-color: ${rgba(p.color, p.alpha)}`,
          class: `${p.role ? 'tv-role' : 'tv-s'}${p.pending ? ' tv-pending' : ''}`,
          title: p.title,
        })
      : Decoration.widget(p.pos, tagWidget(p.label, p.tag, p.color), { side: -1, key: `tag-${p.id}`, ignoreSelection: true }),
  )
  return DecorationSet.create(doc, decos)
}

export const TensionHighlight = Extension.create({
  name: 'tensionHighlight',

  addProseMirrorPlugins() {
    return [
      new Plugin<HighlightState>({
        key: highlightKey,
        state: {
          init: (_, state) => {
            const seg = segmentDoc(state.doc)
            return { seg, deco: build(state.doc, seg) }
          },
          apply: (tr, prev, _old, state) => {
            if (!tr.docChanged && !tr.getMeta(highlightKey)) return prev
            const seg = tr.docChanged ? segmentDoc(state.doc) : prev.seg
            return { seg, deco: build(state.doc, seg) }
          },
        },
        props: {
          decorations: (state) => highlightKey.getState(state)?.deco,
        },
        view: (editorView) => {
          // Repaint when results or view settings change (not on status-only updates).
          let last = store.getSnapshot()
          const unsub = store.subscribe(() => {
            const next = store.getSnapshot()
            const changed = next.view !== last.view || next.version !== last.version || next.status.llm !== last.status.llm
            last = next
            if (changed && !editorView.isDestroyed) editorView.dispatch(editorView.state.tr.setMeta(highlightKey, true))
          })
          return { destroy: unsub }
        },
      }),
    ]
  },
})

export function sentenceAt(state: EditorState, pos: number): { sentence: Sentence; seg: Segmentation } | null {
  const hs = highlightKey.getState(state)
  if (!hs) return null
  const sentence = hs.seg.sentences.find((s) => pos >= s.from && pos <= s.to)
  return sentence ? { sentence, seg: hs.seg } : null
}
