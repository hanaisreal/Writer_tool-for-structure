import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { Check, MessageSquare, Wand2 } from 'lucide-react'
import { useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { COMMENT_CATEGORIES, getCategory } from '../../shared/comments'
import { store } from '../analysis/store'
import { activateComment, applySuggestion, commentsKey, removeComment, visibleComments, type Comment } from '../comments/plugin'

const GAP = 8

/**
 * Comment cards in a column beside the page, each lined up with its anchor
 * and pushed down to avoid overlap — the Google Docs layout.
 */
export function CommentsRail({ editor, pageEl }: { editor: Editor; pageEl: HTMLElement | null }) {
  const { view } = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const { all, visible, activeId } = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const cs = commentsKey.getState(e.state)
      return { all: cs?.comments ?? [], visible: visibleComments(e.state), activeId: cs?.activeId ?? null }
    },
    equalityFn: (a, b) => !!b && a.all === b.all && a.activeId === b.activeId && a.visible.length === b.visible.length,
  })
  const rail = useRef<HTMLDivElement>(null)
  // Measured card elements (a stable Map, mutated by callback refs).
  const [cards] = useState(() => new Map<string, HTMLDivElement>())
  const [tops, setTops] = useState<Record<string, number>>({})
  const [tick, setTick] = useState(0)

  // Re-layout when the page reflows (window resize, zoom, fonts loading).
  useLayoutEffect(() => {
    if (!pageEl) return
    const ro = new ResizeObserver(() => setTick((t) => t + 1))
    ro.observe(pageEl)
    return () => ro.disconnect()
  }, [pageEl])

  useLayoutEffect(() => {
    const railBox = rail.current?.getBoundingClientRect()
    if (!railBox || editor.isDestroyed) return
    const want = visible.map((c) => {
      let top = 0
      try {
        top = editor.view.coordsAtPos(Math.min(c.from, editor.state.doc.content.size)).top - railBox.top
      } catch {
        // Position briefly out of range during an edit; the next layout fixes it.
      }
      return { c, top, height: cards.get(c.id)?.offsetHeight ?? 80 }
    })
    want.sort((a, b) => a.top - b.top)
    // The active card sits exactly at its anchor; others flow around it.
    const next: Record<string, number> = {}
    const ai = want.findIndex((w) => w.c.id === activeId)
    if (ai >= 0) {
      next[want[ai].c.id] = want[ai].top
      let floor = want[ai].top + want[ai].height + GAP
      for (let i = ai + 1; i < want.length; i++) {
        next[want[i].c.id] = Math.max(want[i].top, floor)
        floor = next[want[i].c.id] + want[i].height + GAP
      }
      let ceil = want[ai].top - GAP
      for (let i = ai - 1; i >= 0; i--) {
        next[want[i].c.id] = Math.min(want[i].top, ceil - want[i].height)
        ceil = next[want[i].c.id] - GAP
      }
    } else {
      let floor = 0
      for (const w of want) {
        next[w.c.id] = Math.max(w.top, floor)
        floor = next[w.c.id] + w.height + GAP
      }
    }
    setTops((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
  }, [visible, activeId, editor, tick, all, cards])

  const counts = Object.fromEntries(COMMENT_CATEGORIES.map((c) => [c.id, all.filter((x) => x.category === c.id).length]))
  const toggleCat = (id: string) => store.setView({ commentCats: { ...view.commentCats, [id]: view.commentCats[id as keyof typeof view.commentCats] === false } })
  const activate = (id: string | null) => activateComment(editor.state, editor.view.dispatch, id)
  // Card heights feed the overlap layout above.
  function registerCard(id: string) {
    return (el: HTMLDivElement | null) => {
      if (el) cards.set(id, el)
      else cards.delete(id)
    }
  }

  if (!all.length) return null

  return (
    <aside className="rail" ref={rail} aria-label="Comments">
      <div className="rail-head">
        <label className="check small rail-toggle">
          <input type="checkbox" checked={view.showComments} onChange={(e) => store.setView({ showComments: e.target.checked })} />
          <MessageSquare size={14} /> {all.length} comment{all.length === 1 ? '' : 's'}
        </label>
        {view.showComments && (
          <div className="rail-filters" role="group" aria-label="Comment types">
            {COMMENT_CATEGORIES.filter((c) => counts[c.id]).map((c) => {
              const on = view.commentCats[c.id] !== false
              return (
                <button key={c.id} type="button" className={`cat-chip${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => toggleCat(c.id)} style={{ '--cat': c.color } as CSSProperties}>
                  <span className="cat-dot" /> {c.label} <span className="cat-count">{counts[c.id]}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="rail-cards">
        {visible.map((c) => (
          <CommentCard
            key={c.id}
            c={c}
            active={c.id === activeId}
            top={tops[c.id]}
            measure={registerCard(c.id)}
            onActivate={() => {
              activate(c.id)
              editor.chain().setTextSelection(c.scope === 'paragraph' ? c.from : { from: c.from, to: c.to }).scrollIntoView().run()
            }}
            onResolve={() => removeComment(editor.state, editor.view.dispatch, c.id)}
            onApply={() => applySuggestion(editor.state, editor.view.dispatch, c)}
          />
        ))}
      </div>
    </aside>
  )
}

function CommentCard(props: {
  c: Comment
  active: boolean
  top: number | undefined
  measure: (el: HTMLDivElement | null) => void
  onActivate: () => void
  onResolve: () => void
  onApply: () => void
}) {
  const { c, active, top, measure, onActivate, onResolve, onApply } = props
  const cat = getCategory(c.category)
  return (
    <div
      ref={measure}
      className={`cm-card${active ? ' is-active' : ''}`}
      style={{ top: top ?? 0, visibility: top === undefined ? 'hidden' : undefined, '--cat': cat.color } as CSSProperties}
      onClick={() => !active && onActivate()}
      role="article"
      aria-label={`${cat.label} comment`}
    >
      <div className="cm-head">
        <span className="cm-cat"><span className="cat-dot" />{cat.label}</span>
        {c.priority === 'high' && <span className="cm-prio">High</span>}
        <span className="spacer" />
        <button type="button" className="icon-btn cm-resolve" title="Resolve" aria-label="Resolve comment" onClick={(e) => (e.stopPropagation(), onResolve())}>
          <Check size={15} />
        </button>
      </div>
      <p className="cm-msg">{c.message}</p>
      {c.nextStep && (
        <p className="cm-next"><strong>Next:</strong> {c.nextStep}</p>
      )}
      {c.suggestion && (
        <div className="cm-suggest">
          <span className="cm-old">{c.quote}</span>
          <span className="cm-new">{c.suggestion}</span>
          <button type="button" className="btn btn-small" onClick={(e) => (e.stopPropagation(), onApply())}>
            <Wand2 size={13} /> Apply
          </button>
        </div>
      )}
      <span className="cm-by">{c.by} · {c.scope}</span>
    </div>
  )
}
