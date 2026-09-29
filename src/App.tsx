import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import { Activity, FileText, KeyRound, LogOut } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { MeResponse } from '../shared/genres'
import { scheduler } from './analysis/scheduler'
import { store, type Evaluation, type SentenceResult } from './analysis/store'
import { ApiKeyDialog } from './components/ApiKeyDialog'
import { connectLlm, openKeyDialog } from './llm/connect'
import { keyStore } from './llm/keyStore'
import { AnalysisPanel } from './components/AnalysisPanel'
import { CommentsRail } from './components/CommentsRail'
import { useCommentPersistence } from './comments/persist'
import { FindBar } from './components/FindBar'
import { LoginScreen } from './components/LoginScreen'
import { MenuBar, type Menu } from './components/MenuBar'
import { Popover } from './components/Popover'
import { Toolbar } from './components/Toolbar'
import { WordCountDialog } from './components/WordCountDialog'
import { ExportDialog, PrintLegend, type ExportKind } from './components/ExportDialog'
import { extensions } from './editor/extensions'
import { promptLink } from './editor/link'
import { SAMPLE_HTML, SAMPLE_TITLE } from './editor/sampleDoc'

const DOC_KEY = 'tv.doc.v1'

/** public/sample-analysis.json — AI results for the example essay, saved via Tools in dev. */
interface SampleAnalysis {
  genre: string
  results: [string, SentenceResult][]
  evaluation: Evaluation | null
}

function loadDoc(): { title: string; html: string } {
  try {
    const saved = JSON.parse(localStorage.getItem(DOC_KEY) ?? 'null')
    if (saved?.html) return saved
  } catch {
    // Fall through to the sample.
  }
  return { title: SAMPLE_TITLE, html: SAMPLE_HTML }
}

function download(name: string, type: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}

/** Static build (GitHub Pages): no server — the AI is called from the browser with the visitor's key. */
export const STATIC = import.meta.env.VITE_STATIC === 'true'

export default function App() {
  const [me, setMe] = useState<MeResponse | null>(null)
  const [offline, setOffline] = useState(STATIC)

  useEffect(() => {
    if (STATIC) {
      connectLlm(false)
      return
    }
    fetch('/api/me')
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((data: MeResponse) => {
        setMe(data)
        connectLlm(data.llmEnabled)
      })
      .catch(() => {
        // Server not running: fall back to the browser key, or local estimates.
        setOffline(true)
        connectLlm(false)
      })
  }, [])

  if (!me && !offline) return <div className="boot" aria-busy="true" />
  if (me?.authEnabled && !me.user) return <LoginScreen />
  return <Workspace me={me} />
}

function Workspace({ me }: { me: MeResponse | null }) {
  const [initial] = useState(loadDoc)
  const [title, setTitle] = useState(initial.title)
  const [saved, setSaved] = useState(true)
  const [panelOpen, setPanelOpen] = useState(true)
  const [find, setFind] = useState<null | { replace: boolean }>(null)
  const [wordCount, setWordCount] = useState(false)
  const [exporting, setExporting] = useState<ExportKind | null>(null)
  const [keyDialog, setKeyDialog] = useState(false)
  const [pageEl, setPageEl] = useState<HTMLDivElement | null>(null)
  const { backend } = useSyncExternalStore(store.subscribe, () => store.getSnapshot().status)
  const { key } = useSyncExternalStore(keyStore.subscribe, keyStore.getSnapshot)

  useEffect(() => {
    const open = () => setKeyDialog(true)
    window.addEventListener('tv:open-key', open)
    return () => window.removeEventListener('tv:open-key', open)
  }, [])

  // The bundled example can come with AI analysis baked in, so visitors can
  // see real results before adding a key. Results are keyed by sentence text,
  // so they apply wherever those sentences appear.
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}sample-analysis.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: SampleAnalysis | null) => {
        if (!data?.results) return
        store.putResults(data.genre, data.results)
        if (data.evaluation) store.setEvaluation(data.evaluation)
      })
      .catch(() => {
        // No baked example: local estimates are shown instead.
      })
  }, [])
  const [zoom, setZoom] = useState(100)
  const { view } = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const titleRef = useRef(title)
  useEffect(() => {
    titleRef.current = title
  }, [title])

  const editor = useEditor({
    extensions,
    content: initial.html,
    editorProps: { attributes: { class: 'doc', spellcheck: 'true' } },
  })

  useCommentPersistence(editor)

  // Autosave to this browser.
  useEffect(() => {
    if (!editor) return
    let t: ReturnType<typeof setTimeout>
    const save = () => {
      setSaved(false)
      clearTimeout(t)
      t = setTimeout(() => {
        try {
          localStorage.setItem(DOC_KEY, JSON.stringify({ title: titleRef.current, html: editor.getHTML() }))
        } catch {
          // Quota or privacy mode: keep editing, just unsaved.
        }
        setSaved(true)
      }, 600)
    }
    editor.on('update', save)
    return () => {
      editor.off('update', save)
      clearTimeout(t)
    }
  }, [editor])

  useEffect(() => {
    try {
      const cur = JSON.parse(localStorage.getItem(DOC_KEY) ?? 'null')
      if (cur) localStorage.setItem(DOC_KEY, JSON.stringify({ ...cur, title }))
    } catch {
      // ignore
    }
    document.title = `${title || 'Untitled document'} — Tension`
  }, [title])

  // Wire the analysis scheduler.
  const llm = useSyncExternalStore(store.subscribe, () => store.getSnapshot().status.llm)
  useEffect(() => {
    if (!editor) return
    scheduler.getTitle = () => titleRef.current
    return scheduler.attach(editor)
  }, [editor])
  useEffect(() => {
    if (llm === 'ready') scheduler.scan()
  }, [llm, editor])

  const openFind = useCallback((replace: boolean) => setFind({ replace }), [])

  // App-level shortcuts that the editor doesn't own.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return
      const k = e.key.toLowerCase()
      let handled = true
      if (k === 'f' && !e.shiftKey) openFind(false)
      else if (k === 'h' || (k === 'f' && e.shiftKey)) openFind(true)
      else if (k === 'c' && e.shiftKey) setWordCount(true)
      else if (k === 'p' && !e.shiftKey) setExporting('print')
      else if (k === 'k' && editor) promptLink(editor)
      else if (k === '\\' && editor) editor.chain().focus().unsetAllMarks().clearNodes().run()
      else handled = false
      if (handled) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editor, openFind])

  if (!editor) return <div className="boot" aria-busy="true" />

  const menus = () => buildMenus(editor, {
    title,
    newDoc: () => {
      if (!window.confirm('Start a new blank document? The current one will be replaced.')) return
      editor.commands.setContent('<p></p>', { emitUpdate: true })
      setTitle('Untitled document')
    },
    openFind,
    setWordCount,
    setExporting,
    panelOpen,
    setPanelOpen,
  })

  const signOut = async () => {
    await fetch('/auth/logout', { method: 'POST' })
    window.location.href = '/'
  }

  return (
    <div className="app">
      <header className="app-header">
        <FileText className="app-logo" size={36} aria-hidden />
        <div className="app-titles">
          <div className="title-row">
            <input className="doc-title" value={title} aria-label="Document title" onChange={(e) => setTitle(e.target.value)} onFocus={(e) => e.target.select()} />
            <span className="save-state">{saved ? 'Saved to this browser' : 'Saving…'}</span>
          </div>
          <MenuBar menus={menus} />
        </div>
        <div className="app-actions">
          {backend !== 'server' && (
            <button type="button" className="btn btn-key" onClick={() => setKeyDialog(true)} title={key ? 'API key is set' : 'Add an Anthropic or OpenAI API key'}>
              <KeyRound size={15} />
              <span className={`key-dot${key ? ' is-set' : ''}`} aria-hidden />
              {key ? 'API key' : 'Add API key'}
            </button>
          )}
          <button type="button" className={`btn btn-analysis${panelOpen ? ' is-on' : ''}`} onClick={() => setPanelOpen(!panelOpen)}>
            <Activity size={16} /> Analysis
          </button>
          {!STATIC && <UserMenu me={me} onSignOut={signOut} />}
        </div>
      </header>

      <Toolbar editor={editor} zoom={zoom} setZoom={setZoom} onFind={() => openFind(false)} onPrint={() => setExporting('print')} />

      <div className="workspace">
        <main className={`canvas mode-${view.mode}`}>
          {find && (
            <FindBar
              key={find.replace ? 'replace' : 'find'}
              editor={editor}
              showReplace={find.replace}
              onClose={() => {
                setFind(null)
                editor.commands.focus()
              }}
            />
          )}
          <div className="page-row">
            <div className="page" ref={setPageEl} style={{ zoom: zoom / 100 }} onMouseDown={(e) => e.target === e.currentTarget && editor.commands.focus('end')}>
              <EditorContent editor={editor} />
              <PrintLegend />
            </div>
            <CommentsRail editor={editor} pageEl={pageEl} />
          </div>
          <WordChip editor={editor} onClick={() => setWordCount(true)} />
        </main>
        {panelOpen && <AnalysisPanel editor={editor} title={title} onClose={() => setPanelOpen(false)} />}
      </div>

      {wordCount && <WordCountDialog editor={editor} onClose={() => setWordCount(false)} />}
      {keyDialog && <ApiKeyDialog onClose={() => setKeyDialog(false)} />}
      {exporting && <ExportDialog kind={exporting} editor={editor} title={title} onClose={() => setExporting(null)} />}
    </div>
  )
}

function WordChip({ editor, onClick }: { editor: Editor; onClick: () => void }) {
  const words = useSyncExternalStore(
    (fn) => (editor.on('update', fn), () => editor.off('update', fn)),
    () => editor.storage.characterCount.words() as number,
  )
  return (
    <button type="button" className="word-chip" onClick={onClick} title="Word count (⌘⇧C)">
      {words.toLocaleString()} words
    </button>
  )
}

function UserMenu({ me, onSignOut }: { me: MeResponse | null; onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const user = me?.user
  const initial = (user?.name ?? '?').slice(0, 1).toUpperCase()
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      align="right"
      trigger={
        <button type="button" className="avatar" aria-label="Account" onClick={() => setOpen(!open)}>
          {user?.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" /> : <span>{initial}</span>}
        </button>
      }
    >
      <div className="account">
        {user ? (
          <>
            <strong>{user.name}</strong>
            <span className="muted small">{user.email}</span>
            <button type="button" className="btn" onClick={onSignOut}><LogOut size={14} /> Sign out</button>
          </>
        ) : (
          <span className="muted small">
            {me ? 'Login is off: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env to require Google sign-in.' : 'Server not reachable — running offline with local estimates.'}
          </span>
        )}
      </div>
    </Popover>
  )
}

function buildMenus(
  editor: Editor,
  a: {
    title: string
    newDoc: () => void
    openFind: (replace: boolean) => void
    setWordCount: (v: boolean) => void
    setExporting: (k: ExportKind) => void
    panelOpen: boolean
    setPanelOpen: (v: boolean) => void
  },
): Menu[] {
  const c = () => editor.chain().focus()
  const mode = store.getSnapshot().view.mode
  const safe = (a.title || 'document').replace(/[^\w\- ]+/g, '').trim() || 'document'
  return [
    {
      label: 'File',
      items: [
        { label: 'New document', action: a.newDoc },
        'sep',
        { label: 'Download as PDF (.pdf)…', action: () => a.setExporting('pdf') },
        { label: 'Download as Word (.docx)…', action: () => a.setExporting('docx') },
        { label: 'Download as HTML (.html)', action: () => download(`${safe}.html`, 'text/html', `<!doctype html><meta charset="utf-8"><title>${a.title}</title>${editor.getHTML()}`) },
        { label: 'Download as plain text (.txt)', action: () => download(`${safe}.txt`, 'text/plain', editor.getText({ blockSeparator: '\n\n' })) },
        'sep',
        { label: 'Print…', shortcut: '⌘P', action: () => a.setExporting('print') },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', shortcut: '⌘Z', action: () => c().undo().run(), disabled: !editor.can().undo() },
        { label: 'Redo', shortcut: '⌘⇧Z', action: () => c().redo().run(), disabled: !editor.can().redo() },
        'sep',
        { label: 'Select all', shortcut: '⌘A', action: () => c().selectAll().run() },
        { label: 'Find and replace', shortcut: '⌘⇧H', action: () => a.openFind(true) },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Analysis panel', checked: a.panelOpen, action: () => a.setPanelOpen(!a.panelOpen) },
        'sep',
        { label: 'Highlights off', checked: mode === 'off', action: () => store.setView({ mode: 'off' }) },
        { label: 'Tension highlights', checked: mode === 'tension', action: () => store.setView({ mode: 'tension' }) },
        { label: 'Argument highlights', checked: mode === 'argument', action: () => store.setView({ mode: 'argument' }) },
      ],
    },
    {
      label: 'Insert',
      items: [
        { label: 'Link', shortcut: '⌘K', action: () => promptLink(editor) },
        { label: 'Horizontal line', action: () => c().setHorizontalRule().run() },
        { label: 'Block quote', action: () => c().toggleBlockquote().run() },
      ],
    },
    {
      label: 'Format',
      items: [
        { label: 'Bold', shortcut: '⌘B', action: () => c().toggleBold().run() },
        { label: 'Italic', shortcut: '⌘I', action: () => c().toggleItalic().run() },
        { label: 'Underline', shortcut: '⌘U', action: () => c().toggleUnderline().run() },
        { label: 'Strikethrough', shortcut: '⌘⇧S', action: () => c().toggleStrike().run() },
        'sep',
        { label: 'Normal text', shortcut: '⌘⌥0', action: () => c().setParagraph().run() },
        { label: 'Heading 1', shortcut: '⌘⌥1', action: () => c().setHeading({ level: 1 }).run() },
        { label: 'Heading 2', shortcut: '⌘⌥2', action: () => c().setHeading({ level: 2 }).run() },
        { label: 'Heading 3', shortcut: '⌘⌥3', action: () => c().setHeading({ level: 3 }).run() },
        'sep',
        { label: 'Clear formatting', shortcut: '⌘\\', action: () => c().unsetAllMarks().clearNodes().run() },
      ],
    },
    {
      label: 'Tools',
      items: [
        { label: 'Word count', shortcut: '⌘⇧C', action: () => a.setWordCount(true) },
        { label: 'Re-analyze document', action: () => scheduler.reanalyzeAll(), disabled: store.getSnapshot().status.llm !== 'ready' },
        { label: 'API key…', action: openKeyDialog },
        ...(import.meta.env.DEV
          ? [
              'sep' as const,
              {
                label: 'Save analysis as site example (dev)',
                action: () => {
                  const { view, evaluation } = store.getSnapshot()
                  const data: SampleAnalysis = { genre: view.genre, results: store.exportResults(view.genre), evaluation }
                  download('sample-analysis.json', 'application/json', JSON.stringify(data))
                },
              },
            ]
          : []),
      ],
    },
  ]
}
