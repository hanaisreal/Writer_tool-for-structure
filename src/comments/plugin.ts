// Inline comments anchored to text, Google Docs style. Anchors are document
// positions kept in plugin state and mapped through every edit, so comments
// follow their text as the writer revises; a comment whose text is deleted
// disappears with it.

import { Extension } from '@tiptap/core'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { DraftComment } from '../../shared/comments'
import { store } from '../analysis/store'

export interface Comment extends DraftComment {
  id: string
  from: number
  to: number
  /** Who wrote it: "Claude", "OpenAI", or "Auto-check". */
  by: string
}

interface CommentsState {
  comments: Comment[]
  activeId: string | null
  deco: DecorationSet
}

type Meta = { set: Comment[] } | { remove: string } | { activate: string | null } | { refresh: true }

export const commentsKey = new PluginKey<CommentsState>('comments')

/** Comments passing the current category filter and visibility toggle. */
export function visibleComments(state: EditorState): Comment[] {
  const cs = commentsKey.getState(state)
  const { view } = store.getSnapshot()
  if (!cs || !view.showComments) return []
  return cs.comments.filter((c) => view.commentCats[c.category] !== false)
}

function build(state: EditorState, comments: Comment[], activeId: string | null): DecorationSet {
  const { view } = store.getSnapshot()
  if (!view.showComments) return DecorationSet.empty
  const decos: Decoration[] = []
  for (const c of comments) {
    if (view.commentCats[c.category] === false) continue
    const active = c.id === activeId ? ' is-active' : ''
    if (c.scope === 'paragraph') {
      // Mark the whole paragraph with a margin bar rather than tinting all its text.
      const $pos = state.doc.resolve(Math.min(c.from + 1, state.doc.content.size))
      for (let d = $pos.depth; d > 0; d--) {
        if ($pos.node(d).isTextblock) {
          decos.push(Decoration.node($pos.before(d), $pos.after(d), { class: `cm-para${active}`, 'data-comment': c.id }))
          break
        }
      }
    } else {
      decos.push(Decoration.inline(c.from, c.to, { class: `cm-anchor${active}`, 'data-comment': c.id }))
    }
  }
  return DecorationSet.create(state.doc, decos)
}

function mapComments(tr: Transaction, comments: Comment[]): Comment[] {
  const out: Comment[] = []
  for (const c of comments) {
    const from = tr.mapping.mapResult(c.from, 1)
    const to = tr.mapping.mapResult(c.to, -1)
    // The anchored text was deleted: drop the comment.
    if (to.pos <= from.pos || (from.deleted && to.deleted)) continue
    out.push({ ...c, from: from.pos, to: to.pos })
  }
  return out
}

export const Comments = Extension.create({
  name: 'comments',

  addProseMirrorPlugins() {
    return [
      new Plugin<CommentsState>({
        key: commentsKey,
        state: {
          init: () => ({ comments: [], activeId: null, deco: DecorationSet.empty }),
          apply(tr, prev, _old, state) {
            const meta = tr.getMeta(commentsKey) as Meta | undefined
            let { comments, activeId } = prev
            if (tr.docChanged) comments = mapComments(tr, comments)
            if (meta && 'set' in meta) comments = meta.set
            if (meta && 'remove' in meta) comments = comments.filter((c) => c.id !== meta.remove)
            if (meta && 'activate' in meta) activeId = meta.activate
            if (activeId && !comments.some((c) => c.id === activeId)) activeId = null
            if (!tr.docChanged && !meta) return prev
            return { comments, activeId, deco: build(state, comments, activeId) }
          },
        },
        props: {
          decorations: (state) => commentsKey.getState(state)?.deco,
          // Clicking commented text opens its card; clicking elsewhere closes it.
          handleClick(view, pos) {
            const hit = visibleComments(view.state).find((c) => pos >= c.from && pos <= c.to && c.scope !== 'paragraph')
            const current = commentsKey.getState(view.state)?.activeId ?? null
            const next = hit?.id ?? null
            if (next !== current) view.dispatch(view.state.tr.setMeta(commentsKey, { activate: next }))
            return false
          },
        },
        view: (editorView) => {
          // Repaint when the category filter or visibility changes.
          let last = store.getSnapshot().view
          const unsub = store.subscribe(() => {
            const next = store.getSnapshot().view
            const changed = next.showComments !== last.showComments || next.commentCats !== last.commentCats
            last = next
            if (changed && !editorView.isDestroyed) editorView.dispatch(editorView.state.tr.setMeta(commentsKey, { refresh: true }))
          })
          return { destroy: unsub }
        },
      }),
    ]
  },
})

type Dispatch = (tr: Transaction) => void

export const setComments = (state: EditorState, dispatch: Dispatch, comments: Comment[]) => dispatch(state.tr.setMeta(commentsKey, { set: comments }))
export const removeComment = (state: EditorState, dispatch: Dispatch, id: string) => dispatch(state.tr.setMeta(commentsKey, { remove: id }))
export const activateComment = (state: EditorState, dispatch: Dispatch, id: string | null) => dispatch(state.tr.setMeta(commentsKey, { activate: id }))

/** Replace the anchored text with the comment's suggestion, then resolve it. */
export function applySuggestion(state: EditorState, dispatch: Dispatch, c: Comment) {
  if (!c.suggestion) return
  const tr = state.tr.insertText(c.suggestion, c.from, c.to)
  dispatch(tr.setMeta(commentsKey, { remove: c.id }))
}
