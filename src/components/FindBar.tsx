import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { findKey, replaceAll, replaceCurrent, setSearch, step } from '../editor/findReplace'

export function FindBar({ editor, showReplace, onClose }: { editor: Editor; showReplace: boolean; onClose: () => void }) {
  const [term, setTerm] = useState('')
  const [replacement, setReplacement] = useState('')
  const [matchCase, setMatchCase] = useState(false)
  const [replaceOpen, setReplaceOpen] = useState(showReplace)
  const input = useRef<HTMLInputElement>(null)

  const info = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const fs = findKey.getState(e.state)
      return { count: fs?.matches.length ?? 0, current: fs?.current ?? -1 }
    },
  })

  useEffect(() => input.current?.focus(), [])
  useEffect(() => {
    setSearch(editor.state, editor.view.dispatch, term, matchCase)
  }, [editor, term, matchCase])
  // Clear match highlights when the bar closes.
  useEffect(() => () => setSearch(editor.state, editor.view.dispatch, '', false), [editor])

  const go = (dir: 1 | -1) => {
    const m = step(editor.state, editor.view.dispatch, dir)
    if (m) editor.chain().setTextSelection(m).scrollIntoView().run()
  }

  return (
    <div className="findbar" role="search" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="find-row">
        <input
          ref={input}
          className="find-input"
          placeholder="Find in document"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && go(e.shiftKey ? -1 : 1)}
        />
        <span className="find-count">{term ? `${info.count ? info.current + 1 : 0} of ${info.count}` : ''}</span>
        <button type="button" className="icon-btn" aria-label="Previous match" onClick={() => go(-1)}><ChevronUp size={16} /></button>
        <button type="button" className="icon-btn" aria-label="Next match" onClick={() => go(1)}><ChevronDown size={16} /></button>
        <button type="button" className="icon-btn" aria-label="Close find" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="find-opts">
        <label className="check small"><input type="checkbox" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} /> Match case</label>
        <button type="button" className="link-btn small" onClick={() => setReplaceOpen(!replaceOpen)}>{replaceOpen ? 'Hide replace' : 'Replace…'}</button>
      </div>
      {replaceOpen && (
        <div className="find-row">
          <input className="find-input" placeholder="Replace with" value={replacement} onChange={(e) => setReplacement(e.target.value)} />
          <button type="button" className="btn" disabled={!info.count} onClick={() => replaceCurrent(editor.state, editor.view.dispatch, replacement)}>Replace</button>
          <button type="button" className="btn" disabled={!info.count} onClick={() => replaceAll(editor.state, editor.view.dispatch, replacement)}>All</button>
        </div>
      )}
    </div>
  )
}
