import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { AlertTriangle, Check, Minus, Sparkles } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { getGenre, type EvaluateRequest, type SegmentRole } from '../../shared/genres'
import { openKeyDialog } from '../llm/connect'
import { aiName, evaluateEssay } from '../llm/provider'
import { localReport } from '../analysis/evaluate'
import { highlightKey } from '../analysis/highlight'
import { getPalette, tint } from '../analysis/palettes'
import { findInDoc, hashText } from '../analysis/segment'
import { store } from '../analysis/store'

function jump(editor: Editor, at: { from: number; to: number } | null | undefined) {
  if (!at) return
  editor.chain().focus().setTextSelection(at).scrollIntoView().run()
}

const scoreWord = (n: number) => (n >= 85 ? 'Excellent' : n >= 70 ? 'Strong' : n >= 55 ? 'Solid' : n >= 40 ? 'Developing' : 'Needs work')

export function ScoreTab({ editor, title }: { editor: Editor; title: string }) {
  const { view, status, version, evaluation } = useSyncExternalStore(store.subscribe, store.getSnapshot)
  // Recompute when the document or its analysis changes.
  const seg = useEditorState({ editor, selector: ({ editor: e }) => highlightKey.getState(e.state)?.seg ?? null })
  void version
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!seg || !seg.sentences.length) return <div className="panel-body"><p className="muted small">Write a few paragraphs to score the essay.</p></div>

  const genre = getGenre(view.genre)
  const palette = getPalette(view.palette)
  const report = localReport(seg)
  const docHash = hashText(seg.paragraphs.map((p) => p.text).join('\n'))
  const stale = evaluation && evaluation.hash !== docHash
  const passed = report.checks.filter((c) => c.pass === true).length
  const applicable = report.checks.filter((c) => c.pass !== null).length

  const evaluate = async () => {
    setBusy(true)
    setError(null)
    try {
      const body: EvaluateRequest = { genre: view.genre, title, paragraphs: seg.paragraphs.map((p) => p.text), roleShare: report.roleShare }
      const by = aiName()
      store.setEvaluation({ hash: docHash, result: await evaluateEssay(body), by })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const roles: { id: SegmentRole; label: string; color: string }[] = [
    ...genre.roles.map((r) => ({ id: r.id as SegmentRole, label: r.label, color: palette.roles[r.id] })),
    { id: 'none', label: 'No clear role', color: '#9aa0a6' },
  ]
  const maxShare = Math.max(0.45, ...roles.map((r) => report.roleShare[r.id] ?? 0))
  const maxTension = Math.max(0.01, ...report.paraTension.map((p) => p.value))
  let peak = 0
  report.paraTension.forEach((p, i) => p.value > report.paraTension[peak].value && (peak = i))
  const ev = evaluation?.result

  return (
    <div className="panel-body score">
      {/* ---- Overall ---- */}
      <section className="score-hero">
        {ev ? (
          <>
            <div className="score-big">
              <span className="score-num">{Math.round(ev.overall)}</span>
              <span className="score-of">/ 100</span>
              <span className="score-word">{scoreWord(ev.overall)}</span>
            </div>
            <p className="score-summary">{ev.summary}</p>
            <p className="muted small">Graded by {evaluation?.by ?? 'AI'}{stale ? ' · the document changed since this evaluation' : ''}</p>
          </>
        ) : (
          <p className="muted small">The AI grades the whole essay against a rubric and lists what to fix first.</p>
        )}
        <button type="button" className="btn btn-primary" disabled={busy || status.llm !== 'ready'} onClick={evaluate}>
          <Sparkles size={14} /> {busy ? 'Evaluating…' : ev ? 'Re-evaluate' : `Evaluate with ${aiName()}`}
        </button>
        {status.llm === 'disabled' && (
          <p className="muted small">
            <button type="button" className="link-btn" onClick={openKeyDialog}>Add an API key</button> to grade your own writing. The checks below work without it, from local estimates.
          </p>
        )}
        {error && <p className="status-error" role="alert">{error}</p>}
      </section>

      {/* ---- Improve next ---- */}
      {ev && ev.suggestions.length > 0 && (
        <section>
          <div className="section-head"><span className="section-title">Improve next</span></div>
          <ol className="suggestions">
            {ev.suggestions.map((s, i) => {
              const at = findInDoc(editor.state.doc, s.quote)
              return (
                <li key={i} className={`suggestion prio-${s.priority}`}>
                  <span className="prio">{s.priority}</span>
                  <strong>{s.title}</strong>
                  <span className="small">{s.detail}</span>
                  {s.quote && (
                    <button type="button" className="quote-link" disabled={!at} onClick={() => jump(editor, at)} title={at ? 'Show in text' : 'This passage has changed'}>
                      “{s.quote}”
                    </button>
                  )}
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {/* ---- Rubric ---- */}
      {ev && (
        <section>
          <div className="section-head"><span className="section-title">Rubric</span><span className="muted small">0–10</span></div>
          <ul className="rubric">
            {genre.rubric.map((c) => {
              const r = ev.rubric.find((x) => x.id === c.id)
              if (!r) return null
              return (
                <li key={c.id}>
                  <div className="rubric-row">
                    <span className="rubric-label">{c.label}</span>
                    <span className="bar-track"><span className="bar-fill" style={{ width: `${r.score * 10}%`, background: 'var(--accent)' }} /></span>
                    <span className="bar-num">{r.score.toFixed(r.score % 1 ? 1 : 0)}</span>
                  </div>
                  <span className="rubric-comment">{r.comment}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* ---- Structure checks ---- */}
      <section>
        <div className="section-head">
          <span className="section-title">Structure checks</span>
          <span className="muted small">{passed} of {applicable} pass</span>
        </div>
        <ul className="checks">
          {report.checks.map((c) => (
            <li key={c.id}>
              <button type="button" className="check-row" disabled={!c.at} onClick={() => jump(editor, c.at)}>
                <span className={`check-icon ${c.pass === true ? 'is-pass' : c.pass === false ? 'is-fail' : 'is-na'}`} aria-label={c.pass === true ? 'Pass' : c.pass === false ? 'Needs work' : 'Not applicable'}>
                  {c.pass === true ? <Check size={13} /> : c.pass === false ? <AlertTriangle size={13} /> : <Minus size={13} />}
                </span>
                <span>
                  <span className="check-label">{c.label}</span>
                  <span className="check-detail">{c.detail}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ---- Balance ---- */}
      <section>
        <div className="section-head"><span className="section-title">Role balance</span><span className="muted small">share of words</span></div>
        <ul className="balance" aria-label="Share of words per argument role; the gray band is the healthy range">
          {roles.map((r) => {
            const share = report.roleShare[r.id] ?? 0
            const band = genre.balance[r.id]
            const state = band ? (share < band[0] ? 'low' : share > band[1] ? 'high' : 'ok') : 'ok'
            return (
              <li key={r.id} title={`${r.label}: ${Math.round(share * 100)}%${band ? ` (healthy ${Math.round(band[0] * 100)}–${Math.round(band[1] * 100)}%)` : ''}`}>
                <span className="balance-label">{r.label}</span>
                <span className="balance-track">
                  {band && <span className="balance-band" style={{ left: `${(band[0] / maxShare) * 100}%`, width: `${((band[1] - band[0]) / maxShare) * 100}%` }} />}
                  <span className="balance-fill" style={{ width: `${(share / maxShare) * 100}%`, background: r.id === 'none' ? '#bdc1c6' : tint(r.color), borderRightColor: r.color }} />
                </span>
                <span className={`balance-num${state !== 'ok' ? ' is-off' : ''}`}>
                  {Math.round(share * 100)}%{state !== 'ok' && <span className="balance-flag"> {state}</span>}
                </span>
              </li>
            )
          })}
        </ul>
        {ev?.balance && <p className="note">{ev.balance}</p>}
      </section>

      {/* ---- Tension arc ---- */}
      <section>
        <div className="section-head"><span className="section-title" title="Average of stakes, uncertainty and surprise">Tension by paragraph</span><span className="muted small">click a bar to jump</span></div>
        <div className="arc" role="img" aria-label={`Tension per paragraph; peak at paragraph ${peak + 1}`}>
          {report.paraTension.map((p, i) => (
            <button
              key={i}
              type="button"
              className={`arc-col${i === peak ? ' is-peak' : ''}`}
              title={`Paragraph ${i + 1}: ${Math.round(p.value * 100)}${i === peak ? ' (peak)' : ''}`}
              onClick={() => jump(editor, { from: p.from, to: p.from })}
            >
              <span className="arc-bar" style={{ height: `${Math.max(4, (p.value / maxTension) * 100)}%` }} />
              <span className="arc-x">P{i + 1}</span>
            </button>
          ))}
        </div>
      </section>

      <p className="muted small">
        {report.words.toLocaleString()} words · {report.sentences} sentences · {report.paragraphs} paragraphs ·{' '}
        {report.fromAi === report.sentences ? 'all sentences analyzed by AI' : `${report.sentences - report.fromAi} sentences on local estimates`}
      </p>
    </div>
  )
}
