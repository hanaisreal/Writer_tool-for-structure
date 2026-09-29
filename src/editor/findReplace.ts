// Find & replace, Google Docs style: all matches tinted, the current one stronger.

import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export interface Match {
  from: number
  to: number
}

interface FindState {
  term: string
  matchCase: boolean
  matches: Match[]
  current: number
  deco: DecorationSet
}

export const findKey = new PluginKey<FindState>('findReplace')

function search(doc: PMNode, term: string, matchCase: boolean): Match[] {
  if (!term) return []
  const needle = matchCase ? term : term.toLowerCase()
  const out: Match[] = []
  doc.descendants((node, pos) => {
    if (!node.isText) return true
    const text = matchCase ? node.text! : node.text!.toLowerCase()
    for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + needle.length)) {
      out.push({ from: pos + i, to: pos + i + needle.length })
    }
    return false
  })
  return out
}

function decorate(doc: PMNode, matches: Match[], current: number) {
  return DecorationSet.create(
    doc,
    matches.map((m, i) => Decoration.inline(m.from, m.to, { class: i === current ? 'find-hit find-current' : 'find-hit' })),
  )
}

function recompute(doc: PMNode, term: string, matchCase: boolean, current: number): FindState {
  const matches = search(doc, term, matchCase)
  const idx = matches.length ? Math.min(Math.max(current, 0), matches.length - 1) : -1
  return { term, matchCase, matches, current: idx, deco: decorate(doc, matches, idx) }
}

export const FindReplace = Extension.create({
  name: 'findReplace',
  addProseMirrorPlugins() {
    return [
      new Plugin<FindState>({
        key: findKey,
        state: {
          init: () => ({ term: '', matchCase: false, matches: [], current: -1, deco: DecorationSet.empty }),
          apply(tr, prev, _old, state) {
            const meta = tr.getMeta(findKey) as Partial<Pick<FindState, 'term' | 'matchCase' | 'current'>> | undefined
            if (meta) return recompute(state.doc, meta.term ?? prev.term, meta.matchCase ?? prev.matchCase, meta.current ?? 0)
            if (tr.docChanged && prev.term) return recompute(state.doc, prev.term, prev.matchCase, prev.current)
            return prev
          },
        },
        props: { decorations: (state) => findKey.getState(state)?.deco },
      }),
    ]
  },
})

type Dispatch = (tr: Transaction) => void

export function setSearch(state: EditorState, dispatch: Dispatch, term: string, matchCase: boolean) {
  dispatch(state.tr.setMeta(findKey, { term, matchCase, current: 0 }))
}

export function step(state: EditorState, dispatch: Dispatch, dir: 1 | -1): Match | null {
  const fs = findKey.getState(state)
  if (!fs || !fs.matches.length) return null
  const current = (fs.current + dir + fs.matches.length) % fs.matches.length
  dispatch(state.tr.setMeta(findKey, { current }))
  return fs.matches[current]
}

export function replaceCurrent(state: EditorState, dispatch: Dispatch, replacement: string) {
  const fs = findKey.getState(state)
  const m = fs?.matches[fs.current]
  if (!m) return
  const tr = replacement ? state.tr.insertText(replacement, m.from, m.to) : state.tr.delete(m.from, m.to)
  dispatch(tr.setMeta(findKey, { current: fs!.current }))
}

export function replaceAll(state: EditorState, dispatch: Dispatch, replacement: string) {
  const fs = findKey.getState(state)
  if (!fs?.matches.length) return 0
  const tr = state.tr
  // Back to front so earlier positions stay valid.
  for (const m of [...fs.matches].reverse()) {
    if (replacement) tr.insertText(replacement, m.from, m.to)
    else tr.delete(m.from, m.to)
  }
  dispatch(tr.setMeta(findKey, { current: 0 }))
  return fs.matches.length
}
