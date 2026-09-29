// Flattens the editor document into blocks of styled runs — the common input
// for the PDF and Word writers — optionally carrying the analysis colors.

import type { Editor } from '@tiptap/core'
import type { Mark, Node as PMNode } from '@tiptap/pm/model'
import { computePaint, currentLegend, highlightKey, type Paint } from '../analysis/highlight'
import { flatten, tint } from '../analysis/palettes'

export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strike?: boolean
  /** Hex without alpha, e.g. "#1f1f1f". */
  color?: string
  /** Solid background (analysis color pre-blended over white, or the user's highlight). */
  background?: string
  fontSize?: number
  font?: string
  link?: string
  /** Small role tag drawn before a phrase (argument mode). */
  isTag?: boolean
}

export interface ListMarker {
  kind: 'bullet' | 'ordered'
  level: number
  index: number
  /** Distinguishes separate lists so numbering restarts. */
  listId: number
}

export type Block =
  | {
      type: 'p' | 'h1' | 'h2' | 'h3'
      align: 'left' | 'center' | 'right' | 'justify'
      runs: Run[]
      quote?: boolean
      /** Set on the first paragraph of a list item. */
      list?: ListMarker
      /** List nesting depth, for indenting every paragraph inside lists. */
      indent: number
    }
  | { type: 'hr' }

export interface ExportModel {
  title: string
  blocks: Block[]
  legend: { title: string; items: { label: string; color: string }[] } | null
}

function cssColorToHex(c: string | undefined): string | undefined {
  if (!c) return undefined
  if (/^#[0-9a-f]{6}$/i.test(c)) return c
  if (/^#[0-9a-f]{3}$/i.test(c)) return `#${[...c.slice(1)].map((x) => x + x).join('')}`
  const m = c.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/)
  return m ? `#${[m[1], m[2], m[3]].map((x) => Number(x).toString(16).padStart(2, '0')).join('')}` : undefined
}

function marksToRun(text: string, marks: readonly Mark[]): Run {
  const run: Run = { text }
  for (const m of marks) {
    switch (m.type.name) {
      case 'bold':
        run.bold = true
        break
      case 'italic':
        run.italic = true
        break
      case 'underline':
        run.underline = true
        break
      case 'strike':
        run.strike = true
        break
      case 'link':
        run.link = m.attrs.href
        break
      case 'highlight':
        run.background = cssColorToHex(m.attrs.color) ?? '#fff475'
        break
      case 'textStyle': {
        run.color = cssColorToHex(m.attrs.color) ?? run.color
        if (m.attrs.fontSize) run.fontSize = parseFloat(m.attrs.fontSize)
        if (m.attrs.fontFamily) run.font = String(m.attrs.fontFamily).replace(/["']/g, '').split(',')[0].trim()
        break
      }
    }
  }
  return run
}

export function buildModel(editor: Editor, title: string, withColors: boolean): ExportModel {
  const { doc } = editor.state
  const seg = highlightKey.getState(editor.state)?.seg
  const paint: Paint[] = withColors && seg ? computePaint(seg) : []
  const fills = paint.filter((p): p is Extract<Paint, { kind: 'fill' }> => p.kind === 'fill')
  const tags = new Map<number, Extract<Paint, { kind: 'tag' }>>()
  for (const p of paint) if (p.kind === 'tag') tags.set(p.pos, p)

  const blocks: Block[] = []
  let listCounter = 0

  const textblockRuns = (node: PMNode, start: number): Run[] => {
    const runs: Run[] = []
    node.forEach((child, offset) => {
      const pos = start + offset
      if (!child.isText) {
        if (child.type.name === 'hardBreak') runs.push({ text: '\n' })
        return
      }
      const text = child.text ?? ''
      const base = marksToRun('', child.marks)
      // Cut the text node wherever an analysis fill or tag begins or ends.
      const cuts = new Set([0, text.length])
      for (const f of fills) {
        if (f.to <= pos || f.from >= pos + text.length) continue
        cuts.add(Math.max(0, f.from - pos))
        cuts.add(Math.min(text.length, f.to - pos))
      }
      for (const t of tags.keys()) if (t > pos && t < pos + text.length) cuts.add(t - pos)
      const points = [...cuts].sort((a, b) => a - b)
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i]
        const b = points[i + 1]
        const tag = tags.get(pos + a)
        if (tag) runs.push({ text: ` ${tag.tag} `, isTag: true, bold: true, fontSize: 7, color: '#1f1f1f', background: tint(tag.color) })
        const fill = fills.find((f) => f.from <= pos + a && f.to >= pos + b)
        runs.push({ ...base, text: text.slice(a, b), background: fill ? flatten(fill.color, fill.alpha) : base.background })
      }
    })
    return runs
  }

  interface Ctx {
    quote: boolean
    depth: number
    /** Bullet for the first paragraph of the current list item; consumed once. */
    marker?: { value?: ListMarker }
  }

  const walk = (node: PMNode, pos: number, ctx: Ctx) => {
    const name = node.type.name
    if (name === 'horizontalRule') {
      blocks.push({ type: 'hr' })
      return
    }
    if (node.isTextblock) {
      const align = (node.attrs.textAlign as 'left' | 'center' | 'right' | 'justify' | undefined) ?? 'left'
      const type = name === 'heading' ? (`h${node.attrs.level}` as 'h1' | 'h2' | 'h3') : 'p'
      const list = ctx.marker?.value
      if (ctx.marker) ctx.marker.value = undefined
      blocks.push({ type, align, runs: textblockRuns(node, pos + 1), quote: ctx.quote || undefined, list, indent: ctx.depth })
      return
    }
    if (name === 'bulletList' || name === 'orderedList') {
      const listId = ++listCounter
      let index = 0
      node.forEach((item, itemOffset) => {
        const itemPos = pos + 1 + itemOffset
        const marker = { value: { kind: name === 'bulletList' ? 'bullet' : 'ordered', level: ctx.depth, index: ++index, listId } as ListMarker }
        item.forEach((child, childOffset) => walk(child, itemPos + 1 + childOffset, { quote: ctx.quote, depth: ctx.depth + 1, marker }))
      })
      return
    }
    if (name === 'blockquote') {
      node.forEach((child, offset) => walk(child, pos + 1 + offset, { ...ctx, quote: true }))
      return
    }
    node.forEach((child, offset) => walk(child, pos + 1 + offset, ctx))
  }

  doc.forEach((child, offset) => walk(child, offset, { quote: false, depth: 0 }))
  return { title, blocks, legend: withColors ? currentLegend() : null }
}
