// Keeps comments with the document in this browser, so they survive a reload.
// Positions are re-checked against the text on load; stale ones are re-found
// by their quote or dropped.

import type { Editor } from '@tiptap/react'
import { useEffect } from 'react'
import { findInDoc } from '../analysis/segment'
import { commentsKey, setComments, type Comment } from './plugin'

const KEY = 'tv.comments.v1'

export function useCommentPersistence(editor: Editor | null) {
  useEffect(() => {
    if (!editor) return
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Comment[]
      const { doc } = editor.state
      const restored = saved.flatMap((c) => {
        const size = doc.content.size
        const intact = c.to <= size && c.scope === 'paragraph' ? true : c.to <= size && doc.textBetween(c.from, c.to, ' ') === c.quote
        if (intact) return [c]
        const at = findInDoc(doc, c.quote)
        return at ? [{ ...c, ...at }] : []
      })
      if (restored.length) setComments(editor.state, editor.view.dispatch, restored)
    } catch {
      // Nothing saved, or storage unavailable.
    }

    let last = commentsKey.getState(editor.state)?.comments
    let timer: ReturnType<typeof setTimeout>
    const save = () => {
      const now = commentsKey.getState(editor.state)?.comments
      if (now === last) return
      last = now
      clearTimeout(timer)
      timer = setTimeout(() => {
        try {
          localStorage.setItem(KEY, JSON.stringify(now ?? []))
        } catch {
          // Non-essential.
        }
      }, 500)
    }
    editor.on('transaction', save)
    return () => {
      editor.off('transaction', save)
      clearTimeout(timer)
    }
  }, [editor])
}
