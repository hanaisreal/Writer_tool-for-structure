import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import { AlertTriangle, ArrowRight, Check, ExternalLink, MessageSquare, Sparkles } from 'lucide-react'
import { useState, useSyncExternalStore } from 'react'
import { COMMENT_CATEGORY_IDS, getCategory, type CommentCategoryId } from '../../shared/comments'
import { getGenre, type SegmentRole } from '../../shared/genres'
import { getRubric, overallScore, RUBRICS } from '../../shared/rubrics'
import { localReport } from '../analysis/evaluate'
import { highlightKey } from '../analysis/highlight'
import { balanceInsight, paragraphSeries, seriesInsight, type Insight, type Metric } from '../analysis/insights'
import { getPalette, tint } from '../analysis/palettes'
import { findInDoc, hashText } from '../analysis/segment'
import { store } from '../analysis/store'
import { localComments } from '../comments/local'
import { commentBudget, placeComments } from '../comments/place'
import { commentsKey, setComments } from '../comments/plugin'
import { openKeyDialog } from '../llm/connect'
import { aiName, commentEssay, evaluateEssay } from '../llm/provider'

function jump(editor: Editor, at: { from: number; to: number } | null | undefined) {
  if (!at) return
  editor.chain().focus().setTextSelection(at).scrollIntoView().run()
}

/** Show only these comment categories in the text. */
function focusComments(categories: CommentCategoryId[]) {
  store.setView({ showComments: true, commentCats: Object.fromEntries(COMMENT_CATEGORY_IDS.map((id) => [id, categories.includes(id)])) })
}

const fmt = (n: number, step: number) => (step < 1 ? n.toFixed(1) : String(Math.round(n)))

export function ScoreTab({ editor, title }: { editor: Editor; title: string }) {
  const { view, status, version, evaluation } = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const seg = useEditorState({ editor, selector: ({ editor: e }) => highlightKey.getState(e.state)?.seg ?? null })
  const comments = useEditorState({ editor, selector: ({ editor: e }) => commentsKey.getState(e.state)?.comments ?? [] })
  void version
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [metric, setMetric] = useState<Metric>('tension')

  if (!seg || !seg.sentences.length) return <div className="panel-body"><p className="muted small">Write a few paragraphs to score the essay.</p></div>

  const genre = getGenre(view.genre)
  const palette = getPalette(view.palette)
  const rubric = getRubric(view.rubric)
  const report = localReport(seg)
  const paragraphs = seg.paragraphs.map((p) => p.text)
  const docHash = hashText(paragraphs.join('\n'))
  const ev = evaluation?.result.rubric === rubric.id ? evaluation.result : null
  const stale = ev && evaluation?.hash !== docHash
  const ready = status.llm === 'ready'
  const paraAt = (i: number) => {
    const from = seg.paragraphs[i]?.sentences[0]?.from ?? 0
    return { from, to: from }
  }

  const run = async () => {
    setBusy(true)
    setError(null)
    const max = commentBudget(report.words, view.commentAmount)
    try {
      if (!ready) {
        setComments(editor.state, editor.view.dispatch, placeComments(editor.state.doc, seg, localComments(seg, max), 'Auto-check'))
        store.setView({ showComments: true })
        return
      }
      const by = aiName()
      // Grade and comment in parallel; either can succeed on its own.
      const [graded, commented] = await Promise.allSettled([
        evaluateEssay({ genre: view.genre, title, paragraphs, rubric: rubric.id }),
        commentEssay({ genre: view.genre, title, paragraphs, maxComments: max }),
      ])
      if (graded.status === 'fulfilled') store.setEvaluation({ hash: docHash, result: graded.value, by })
      if (commented.status === 'fulfilled') {
        const latest = highlightKey.getState(editor.state)?.seg ?? seg
        setComments(editor.state, editor.view.dispatch, placeComments(editor.state.doc, latest, commented.value.comments, by))
        store.setView({ showComments: true })
      }
      const failed = [graded, commented].find((r): r is PromiseRejectedResult => r.status === 'rejected')
      if (failed) setError(failed.reason instanceof Error ? failed.reason.message : String(failed.reason))
    } finally {
      setBusy(false)
    }
  }

  const overall = ev ? overallScore(rubric, Object.fromEntries(ev.scores.map((s) => [s.id, s.score]))) : null
  const series = paragraphSeries(seg, metric)
  const seriesIns = seriesInsight(series, seg)
  const balanceIns = balanceInsight(view.genre, report.roleShare, seg)
  const maxVal = Math.max(0.01, ...series.values)
  // Emphasize the bar the insight talks about: the peak for tension, the problem paragraph otherwise.
  const peakIdx = series.values.reduce((b, x, i, xs) => (x > xs[b] ? i : b), 0)
  const focusBar = metric === 'tension' ? peakIdx : seriesIns.paragraph
  const failing = report.checks.filter((c) => c.pass === false)
  const high = comments.filter((c) => c.priority === 'high').length

  const roles: { id: SegmentRole; label: string; color: string }[] = [
    ...genre.roles.map((r) => ({ id: r.id as SegmentRole, label: r.label, color: palette.roles[r.id] })),
    { id: 'none', label: 'No clear role', color: '#9aa0a6' },
  ]
  const maxShare = Math.max(0.45, ...roles.map((r) => report.roleShare[r.id] ?? 0))

  return (
    <div className="panel-body score">
      {/* ---- Grade ---- */}
      <section className="score-hero">
        <label className="field">
          <span className="field-label">Rubric</span>
          <select className="select" value={rubric.id} onChange={(e) => store.setView({ rubric: e.target.value })}>
            {RUBRICS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <a className="rubric-source small" href={rubric.url} target="_blank" rel="noreferrer">
            {rubric.source} <ExternalLink size={11} />
          </a>
        </label>

        {ev && overall ? (
          <>
            <div className="score-big">
              {rubric.id === 'ielts-task2' && <span className="score-of">Band</span>}
              <span className="score-num">{fmt(overall.value, rubric.round)}</span>
              {rubric.id !== 'ielts-task2' && <span className="score-of">/ {overall.max}</span>}
            </div>
            <p className="score-summary">{ev.summary}</p>
            <p className="muted small">Graded by {evaluation?.by ?? 'AI'}{stale ? ' · the document changed since' : ''}</p>
          </>
        ) : (
          <p className="muted small">
            {ready ? `${aiName()} grades the essay on this rubric and leaves comments in the text.` : 'Quick checks leave rule-based comments in the text. '}
            {!ready && <><button type="button" className="link-btn" onClick={openKeyDialog}>Add an API key</button> for a rubric grade and AI comments.</>}
          </p>
        )}

        <div className="run-row">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={run}>
            <Sparkles size={14} /> {busy ? 'Working…' : ready ? (ev ? 'Re-evaluate' : 'Evaluate & comment') : 'Run quick checks'}
          </button>
          <select className="select amount" value={view.commentAmount} aria-label="How many comments" title="Focused: a few prioritized comments. Thorough: more, including smaller issues." onChange={(e) => store.setView({ commentAmount: e.target.value as 'focused' | 'thorough' })}>
            <option value="focused">Focused</option>
            <option value="thorough">Thorough</option>
          </select>
        </div>
        {comments.length > 0 && (
          <button type="button" className="link-btn small" onClick={() => focusComments(COMMENT_CATEGORY_IDS)}>
            <MessageSquare size={12} /> {comments.length} comments in the text{high ? ` · ${high} high priority` : ''}
          </button>
        )}
        {error && <p className="status-error" role="alert">{error}</p>}
      </section>

      {/* ---- Criteria ---- */}
      {ev && (
        <section>
          <ul className="rubric">
            {rubric.criteria.map((c) => {
              const s = ev.scores.find((x) => x.id === c.id)
              if (!s) return null
              const linked = comments.filter((x) => c.categories.includes(x.category)).length
              return (
                <li key={c.id}>
                  <div className="rubric-row">
                    <span className="rubric-label">{c.label}</span>
                    <span className="bar-track"><span className="bar-fill" style={{ width: `${((s.score - c.min) / (c.max - c.min)) * 100}%`, background: 'var(--accent)' }} /></span>
                    <span className="bar-num">{fmt(s.score, rubric.step)}/{c.max}</span>
                  </div>
                  <span className="rubric-comment">
                    {s.reason}
                    {linked > 0 && (
                      <> · <button type="button" className="link-btn" onClick={() => focusComments(c.categories)}>{linked} comment{linked > 1 ? 's' : ''}</button></>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* ---- Next steps ---- */}
      {ev && ev.nextSteps.length > 0 && (
        <section>
          <div className="section-head"><span className="section-title">Next steps</span></div>
          <ol className="next-steps">
            {ev.nextSteps.map((n, i) => {
              const at = findInDoc(editor.state.doc, n.quote)
              return (
                <li key={i}>
                  <strong>{n.title}</strong>
                  <span className="small">{n.detail}</span>
                  <button type="button" className="quote-link" disabled={!at} onClick={() => jump(editor, at)} title={at ? 'Show in text' : 'This passage has changed'}>
                    “{n.quote}”
                  </button>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {/* ---- Patterns ---- */}
      <section>
        <div className="section-head">
          <span className="section-title">Paragraph pattern</span>
          <div className="mini-seg" role="radiogroup" aria-label="Metric">
            {(['tension', 'looseness', 'pace'] as Metric[]).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={metric === m} className={metric === m ? 'is-on' : ''} onClick={() => setMetric(m)}>
                {m === 'tension' ? 'Tension' : m === 'looseness' ? 'Looseness' : 'Pace'}
              </button>
            ))}
          </div>
        </div>
        <div className="arc" role="img" aria-label={`${metric} per paragraph`}>
          {series.values.map((v, i) => (
            <button
              key={i}
              type="button"
              className={`arc-col${i === focusBar ? ' is-peak' : ''}`}
              title={`P${i + 1}: ${metric === 'looseness' ? `${Math.round(v * 100)}% of sentences loose` : Math.round(v * 100)}`}
              onClick={() => jump(editor, paraAt(i))}
            >
              <span className="arc-bar" style={{ height: `${Math.max(4, (v / maxVal) * 100)}%` }} />
              <span className="arc-x">P{i + 1}</span>
            </button>
          ))}
        </div>
        <InsightBox insight={seriesIns} onJump={(p) => jump(editor, paraAt(p))} />
      </section>

      {/* ---- Balance ---- */}
      <section>
        <div className="section-head"><span className="section-title">Role balance</span><span className="muted small">share of words</span></div>
        <ul className="balance" aria-label="Share of words per argument role; the gray band is the typical range">
          {roles.map((r) => {
            const share = report.roleShare[r.id] ?? 0
            const band = genre.balance[r.id]
            const state = band ? (share < band[0] ? 'low' : share > band[1] ? 'high' : 'ok') : 'ok'
            return (
              <li key={r.id} title={`${r.label}: ${Math.round(share * 100)}%${band ? ` (typical ${Math.round(band[0] * 100)}–${Math.round(band[1] * 100)}%)` : ''}`}>
                <span className="balance-label">{r.label}</span>
                <span className="balance-track">
                  {band && <span className="balance-band" style={{ left: `${(band[0] / maxShare) * 100}%`, width: `${((band[1] - band[0]) / maxShare) * 100}%` }} />}
                  <span className="balance-fill" style={{ width: `${(share / maxShare) * 100}%`, background: r.id === 'none' ? '#bdc1c6' : tint(r.color), borderRightColor: r.color }} />
                </span>
                <span className={`balance-num${state !== 'ok' ? ' is-off' : ''}`}>{Math.round(share * 100)}%{state !== 'ok' && <span className="balance-flag"> {state}</span>}</span>
              </li>
            )
          })}
        </ul>
        <InsightBox insight={balanceIns} onJump={(p) => jump(editor, paraAt(p))} />
      </section>

      {/* ---- Checks (only what fails) ---- */}
      <section>
        <div className="section-head">
          <span className="section-title">Quick checks</span>
          <span className="muted small">{report.checks.filter((c) => c.pass).length} of {report.checks.filter((c) => c.pass !== null).length} pass</span>
        </div>
        {failing.length === 0 ? (
          <p className="muted small"><Check size={12} /> All structure checks pass.</p>
        ) : (
          <ul className="checks">
            {failing.map((c) => (
              <li key={c.id}>
                <button type="button" className="check-row" disabled={!c.at} onClick={() => jump(editor, c.at)}>
                  <span className="check-icon is-fail"><AlertTriangle size={13} /></span>
                  <span>
                    <span className="check-label">{c.label}</span>
                    <span className="check-detail">{c.detail}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="muted small">
        {report.words.toLocaleString()} words · {report.paragraphs} paragraphs · patterns use{' '}
        {report.fromAi === report.sentences ? 'AI analysis' : `local estimates for ${report.sentences - report.fromAi} of ${report.sentences} sentences`}
      </p>
    </div>
  )
}

function InsightBox({ insight, onJump }: { insight: Insight; onJump: (paragraph: number) => void }) {
  const cat = insight.category ? getCategory(insight.category) : null
  return (
    <div className={`insight is-${insight.tone}`}>
      <p className="insight-meaning">{insight.meaning}</p>
      {insight.next && (
        <p className="insight-next"><ArrowRight size={13} /> <span><strong>Next:</strong> {insight.next}</span></p>
      )}
      {(insight.paragraph !== undefined || cat) && (
        <div className="insight-actions">
          {insight.paragraph !== undefined && (
            <button type="button" className="btn btn-small" onClick={() => onJump(insight.paragraph!)}>Go to P{insight.paragraph + 1}</button>
          )}
          {cat && (
            <button type="button" className="btn btn-small" onClick={() => focusComments([cat.id])}>Show {cat.label.toLowerCase()} comments</button>
          )}
        </div>
      )}
    </div>
  )
}
