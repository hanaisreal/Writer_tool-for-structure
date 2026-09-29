import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { AlertCircle, RefreshCw, X } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { GENRES, getGenre, type AxisDef } from '../../shared/genres'
import { axisIntensity, resolveSentence, rgba, sentenceAt } from '../analysis/highlight'
import { getPalette, maxAlpha, PALETTES, type Palette } from '../analysis/palettes'
import { locateSegments } from '../analysis/segment'
import { scheduler } from '../analysis/scheduler'
import { store, type Mode } from '../analysis/store'
import { ScoreTab } from './ScoreTab'
import { openKeyDialog } from '../llm/connect'
import { PANEL_DEFAULT, PANEL_MIN, panelMax, usePanelWidth } from './usePanelWidth'

function Switch(props: { on: boolean; color: string; label: string; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.on}
      aria-label={props.label}
      className={`switch${props.on ? ' is-on' : ''}`}
      style={props.on ? { background: props.color } : undefined}
      onClick={() => props.onChange(!props.on)}
    >
      <span className="switch-knob" />
    </button>
  )
}

function AllSwitch(props: { on: boolean; label: string; onChange: (on: boolean) => void }) {
  return (
    <span className="all-switch">
      <span className="small muted">All</span>
      <Switch on={props.on} color="#0b57d0" label={props.label} onChange={props.onChange} />
    </span>
  )
}

function Swatch({ axis, palette }: { axis: AxisDef; palette: Palette }) {
  const color = palette.axes[axis.id]
  if (axis.negColor) {
    return <span className="swatch" style={{ background: `linear-gradient(90deg, ${palette.valenceNeg} 50%, ${color} 50%)` }} />
  }
  return <span className="swatch" style={{ background: axis.invert ? `linear-gradient(90deg, ${color}, ${rgba(color, 0.1)})` : color }} />
}

function PalettePicker({ current, mode }: { current: string; mode: Mode }) {
  return (
    <div className="field">
      <span className="field-label">Color pack</span>
      <div className="palette-grid" role="radiogroup" aria-label="Color pack">
        {PALETTES.map((p) => {
          const colors = mode === 'argument' ? Object.values(p.roles) : [...Object.values(p.axes), p.valenceNeg]
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={current === p.id}
              className={`palette-card${current === p.id ? ' is-on' : ''}`}
              onClick={() => store.setView({ palette: p.id })}
            >
              <span className="palette-dots">
                {colors.map((c, i) => <span key={i} style={{ background: rgba(c, maxAlpha(c)) }} />)}
              </span>
              <span className="palette-name">{p.label}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function StatusLine() {
  const { status } = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const busy = status.queued + status.running
  let text: string
  if (status.llm === 'disabled') text = 'Showing local estimates. Add your API key to analyze your own writing with Claude.'
  else if (status.llm === 'unknown') text = 'Connecting…'
  else if (busy) text = `Claude is reading… ${busy} paragraph${busy > 1 ? 's' : ''} left`
  else text = 'Up to date with Claude'
  return (
    <div className="status">
      <div className="status-row">
        <span className={`status-dot${busy ? ' is-busy' : ''}${status.llm === 'disabled' ? ' is-off' : ''}`} />
        <span>{text}</span>
        {status.llm === 'disabled' && (
          <button type="button" className="btn btn-small" onClick={openKeyDialog}>Add key</button>
        )}
        {status.llm === 'ready' && (
          <button type="button" className="icon-btn" title="Re-analyze everything" aria-label="Re-analyze everything" onClick={() => scheduler.reanalyzeAll()}>
            <RefreshCw size={14} />
          </button>
        )}
      </div>
      {status.error && (
        <div className="status-error" role="alert">
          <AlertCircle size={14} />
          <span>{status.error}</span>
          {status.needsKey ? (
            <button type="button" className="link-btn" onClick={openKeyDialog}>Update key</button>
          ) : (
            <button type="button" className="link-btn" onClick={() => scheduler.retry()}>Retry</button>
          )}
        </div>
      )}
    </div>
  )
}

function CurrentSentence({ editor }: { editor: Editor }) {
  const { view, version } = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const hit = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const found = sentenceAt(e.state, e.state.selection.from)
      return found ? { hash: found.sentence.hash, text: found.sentence.text, found } : null
    },
    equalityFn: (a, b) => a?.hash === b?.hash && a?.text === b?.text,
  })
  void version // re-render when results arrive
  if (!hit) return <p className="muted small">Place the cursor in a sentence to see its breakdown.</p>

  const genre = getGenre(view.genre)
  const palette = getPalette(view.palette)
  const r = resolveSentence(hit.found.sentence, hit.found.seg)
  const parts = locateSegments(hit.text, r.segments)

  return (
    <div className="current">
      <div className="current-head">
        <span className="section-title">This sentence</span>
        <span className={`source-badge${r.source === 'claude' ? ' is-claude' : ''}`}>{r.source === 'claude' ? 'Claude' : r.pending ? 'Estimate · analyzing' : 'Estimate'}</span>
      </div>
      {view.mode !== 'argument' && (
        <div className="bars">
          {genre.axes.map((a) => {
            const { value, color } = axisIntensity(a, r.scores)
            const raw = r.scores[a.id]
            return (
              <div key={a.id} className={`bar-row${view.axes[a.id] ? '' : ' is-dim'}`}>
                <span className="bar-label">{a.invert ? 'Looseness' : a.label}</span>
                <span className="bar-track">
                  <span className="bar-fill" style={{ width: `${Math.round(value * 100)}%`, background: color }} />
                </span>
                <span className="bar-num">{a.negColor ? raw.toFixed(2) : Math.round(value * 100)}</span>
              </div>
            )
          })}
        </div>
      )}
      {view.mode === 'argument' && (
        <ul className="role-list">
          {parts.map((p, i) => {
            const role = genre.roles.find((x) => x.id === p.role)
            const shown = role && p.strength >= view.roleThreshold
            return (
              <li key={i}>
                <span className="role-head">
                  <span className={`role-chip${shown ? '' : ' is-hidden'}`} style={shown ? { background: rgba(palette.roles[role.id], maxAlpha(palette.roles[role.id])) } : undefined}>
                    {role ? role.label : 'No clear role'}
                  </span>
                  {role && <span className="muted small">strength {Math.round(p.strength * 100)}{shown ? '' : ' · below threshold'}</span>}
                </span>
                <span className="role-text">{p.text}</span>
              </li>
            )
          })}
        </ul>
      )}
      {r.note && <p className="note">{r.note}</p>}
    </div>
  )
}

function ResizeHandle({ width, onResize }: { width: number; onResize: (w: number) => void }) {
  const [dragging, setDragging] = useState(false)

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const startX = e.clientX
    const startW = width
    const el = e.currentTarget
    el.setPointerCapture(e.pointerId)
    setDragging(true)
    // The panel sits on the right, so dragging left widens it.
    const move = (ev: PointerEvent) => onResize(startW + (startX - ev.clientX))
    const up = () => {
      setDragging(false)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    }
    el.addEventListener('pointermove', move)
    el.addEventListener('pointerup', up)
    el.addEventListener('pointercancel', up)
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize analysis panel"
      aria-valuenow={width}
      aria-valuemin={PANEL_MIN}
      aria-valuemax={panelMax()}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      className={`panel-resizer${dragging ? ' is-dragging' : ''}`}
      onPointerDown={onPointerDown}
      onDoubleClick={() => onResize(PANEL_DEFAULT)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 64 : 16
        if (e.key === 'ArrowLeft') onResize(width + step)
        else if (e.key === 'ArrowRight') onResize(width - step)
        else if (e.key === 'Home') onResize(panelMax())
        else if (e.key === 'End') onResize(PANEL_MIN)
        else return
        e.preventDefault()
      }}
    />
  )
}

export function AnalysisPanel({ editor, title, onClose }: { editor: Editor; title: string; onClose: () => void }) {
  const [tab, setTab] = useState<'highlights' | 'score'>('highlights')
  const [width, setWidth] = usePanelWidth()
  return (
    <aside className="panel" aria-label="Analysis" style={{ width }}>
      <ResizeHandle width={width} onResize={setWidth} />
      <header className="panel-head">
        <div className="panel-tabs" role="tablist" aria-label="Analysis views">
          <button type="button" role="tab" aria-selected={tab === 'highlights'} className={tab === 'highlights' ? 'is-on' : ''} onClick={() => setTab('highlights')}>
            Highlights
          </button>
          <button type="button" role="tab" aria-selected={tab === 'score'} className={tab === 'score' ? 'is-on' : ''} onClick={() => setTab('score')}>
            Score
          </button>
        </div>
        <button type="button" className="icon-btn" aria-label="Close analysis panel" onClick={onClose}><X size={16} /></button>
      </header>
      {tab === 'highlights' ? <HighlightsTab editor={editor} /> : <ScoreTab editor={editor} title={title} />}
    </aside>
  )
}

function HighlightsTab({ editor }: { editor: Editor }) {
  const { view } = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const genre = getGenre(view.genre)
  const palette = getPalette(view.palette)
  const modes: { id: Mode; label: string }[] = [
    { id: 'off', label: 'Off' },
    { id: 'tension', label: 'Tension' },
    { id: 'argument', label: 'Argument' },
  ]
  const activeAxes = genre.axes.filter((a) => view.axes[a.id]).length

  return (
      <div className="panel-body">
        <label className="field">
          <span className="field-label">Writing type</span>
          <select
            className="select"
            value={view.genre}
            onChange={(e) => {
              store.setView({ genre: e.target.value })
              scheduler.scan()
            }}
          >
            {GENRES.map((g) => <option key={g.id} value={g.id} disabled={!g.available}>{g.label}</option>)}
          </select>
        </label>

        <div className="segmented" role="radiogroup" aria-label="Highlight mode">
          {modes.map((m) => (
            <button key={m.id} type="button" role="radio" aria-checked={view.mode === m.id} className={view.mode === m.id ? 'is-on' : ''} onClick={() => store.setView({ mode: m.id })}>
              {m.label}
            </button>
          ))}
        </div>

        {view.mode === 'tension' && (
          <section>
            <div className="section-head">
              <span className="section-title">Tension axes</span>
              <AllSwitch
                on={activeAxes === genre.axes.length}
                label="All axes"
                onChange={(on) => store.setView({ axes: Object.fromEntries(genre.axes.map((x) => [x.id, on])) as typeof view.axes })}
              />
            </div>
            <ul className="toggle-list">
              {genre.axes.map((a) => (
                <li key={a.id}>
                  <Swatch axis={a} palette={palette} />
                  <button type="button" className="toggle-name" title="Show only this axis" onClick={() => store.setView({ axes: Object.fromEntries(genre.axes.map((x) => [x.id, x.id === a.id])) as typeof view.axes })}>
                    <span className="toggle-label">{a.label}</span>
                    <span className="toggle-hint">{a.hint}</span>
                  </button>
                  <Switch on={view.axes[a.id]} color={palette.axes[a.id]} label={`Show ${a.label}`} onChange={(on) => store.setView({ axes: { ...view.axes, [a.id]: on } })} />
                </li>
              ))}
            </ul>
            <p className="muted small">
              Click a name to show only that axis.{activeAxes > 1 && ' With several on, each sentence takes the color of its strongest axis.'}
            </p>
            <label className="check small">
              <input type="checkbox" checked={view.relative} onChange={(e) => store.setView({ relative: e.target.checked })} />
              Scale to this document (strongest sentence = darkest)
            </label>
            <label className="field threshold">
              <span className="field-label">
                Highlight only {view.relative ? `the top ${Math.round((1 - view.threshold) * 100)}%` : `scores ≥ ${Math.round(view.threshold * 100)}`}
              </span>
              <input
                type="range"
                min={0.3}
                max={0.95}
                step={0.05}
                value={view.threshold}
                aria-label="Highlight threshold"
                onChange={(e) => store.setView({ threshold: Number(e.target.value) })}
              />
              <span className="range-ends muted small">
                <span>More sentences</span>
                <span>Only standouts</span>
              </span>
            </label>
          </section>
        )}

        {view.mode === 'argument' && (
          <section>
            <div className="section-head">
              <span className="section-title">Argument roles</span>
              <span className="head-controls">
                <label className="check small">
                  <input type="checkbox" checked={view.showTags} onChange={(e) => store.setView({ showTags: e.target.checked })} /> Tags
                </label>
                <AllSwitch
                  on={genre.roles.every((r) => view.roles[r.id])}
                  label="All roles"
                  onChange={(on) => store.setView({ roles: Object.fromEntries(genre.roles.map((x) => [x.id, on])) as typeof view.roles })}
                />
              </span>
            </div>
            <ul className="toggle-list">
              {genre.roles.map((r) => (
                <li key={r.id}>
                  <span className="swatch" style={{ background: palette.roles[r.id] }} />
                  <button type="button" className="toggle-name" title="Show only this role" onClick={() => store.setView({ roles: Object.fromEntries(genre.roles.map((x) => [x.id, x.id === r.id])) as typeof view.roles })}>
                    <span className="toggle-label">{r.label} <span className="tag-preview" style={{ background: rgba(palette.roles[r.id], maxAlpha(palette.roles[r.id])), borderColor: palette.roles[r.id] }}>{r.tag}</span></span>
                    <span className="toggle-hint">{r.hint}</span>
                  </button>
                  <Switch on={view.roles[r.id]} color={palette.roles[r.id]} label={`Show ${r.label}`} onChange={(on) => store.setView({ roles: { ...view.roles, [r.id]: on } })} />
                </li>
              ))}
            </ul>
            <label className="field threshold">
              <span className="field-label">Hide roles weaker than {Math.round(view.roleThreshold * 100)}</span>
              <input
                type="range"
                min={0}
                max={0.9}
                step={0.05}
                value={view.roleThreshold}
                aria-label="Role strength threshold"
                onChange={(e) => store.setView({ roleThreshold: Number(e.target.value) })}
              />
              <span className="range-ends muted small">
                <span>Show every role</span>
                <span>Only strong ones</span>
              </span>
            </label>
            <p className="muted small">Text with no argumentative job is never highlighted.</p>
          </section>
        )}

        {view.mode !== 'off' && <PalettePicker current={palette.id} mode={view.mode} />}

        {view.mode !== 'off' && (
          <label className="field">
            <span className="field-label">Highlight strength</span>
            <input type="range" min={0.3} max={1} step={0.05} value={view.strength} onChange={(e) => store.setView({ strength: Number(e.target.value) })} />
          </label>
        )}

        <hr className="rule" />
        <CurrentSentence editor={editor} />
        <hr className="rule" />
        <StatusLine />
      </div>
  )
}
