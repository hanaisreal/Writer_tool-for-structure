import type { Editor } from '@tiptap/react'
import { useEffect, useRef } from 'react'

export function WordCountDialog({ editor, onClose }: { editor: Editor; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => ref.current?.showModal(), [])

  const { from, to, empty } = editor.state.selection
  const selected = empty ? null : editor.state.doc.textBetween(from, to, ' ')
  const all = editor.getText()
  const count = (t: string) => ({
    words: t.split(/\s+/).filter(Boolean).length,
    chars: t.length,
    charsNoSpace: t.replace(/\s/g, '').length,
  })
  const doc = count(all)
  const sel = selected ? count(selected) : null
  const pages = Math.max(1, Math.ceil(doc.words / 500))

  return (
    <dialog ref={ref} className="dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <h2>Word count</h2>
      <table className="wc-table">
        <tbody>
          {sel && <tr><td colSpan={2} className="muted small">{sel.words} of {doc.words} words selected</td></tr>}
          <tr><td>Pages</td><td>{pages}</td></tr>
          <tr><td>Words</td><td>{doc.words}</td></tr>
          <tr><td>Characters</td><td>{doc.chars}</td></tr>
          <tr><td>Characters excluding spaces</td><td>{doc.charsNoSpace}</td></tr>
        </tbody>
      </table>
      <div className="dialog-actions">
        <button type="button" className="btn btn-primary" onClick={onClose}>OK</button>
      </div>
    </dialog>
  )
}
