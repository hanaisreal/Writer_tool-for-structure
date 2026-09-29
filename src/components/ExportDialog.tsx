import type { Editor } from '@tiptap/react'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { currentLegend } from '../analysis/highlight'
import { store } from '../analysis/store'
import { buildModel } from '../export/model'
import { printDocument } from '../export/print'

export type ExportKind = 'pdf' | 'docx' | 'print'

const COPY: Record<ExportKind, { title: string; action: string }> = {
  pdf: { title: 'Download as PDF', action: 'Download PDF' },
  docx: { title: 'Download as Word', action: 'Download .docx' },
  print: { title: 'Print', action: 'Print' },
}

export function ExportDialog({ kind, editor, title, onClose }: { kind: ExportKind; editor: Editor; title: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const { view } = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const hasColors = view.mode !== 'off'
  const [withColors, setWithColors] = useState(hasColors)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const legend = currentLegend()

  useEffect(() => ref.current?.showModal(), [])

  const base = (title || 'document').replace(/[\\/:*?"<>|]+/g, '').trim() || 'document'
  const run = async () => {
    if (kind === 'print') {
      onClose()
      // Let the dialog close before the print preview snapshots the page.
      requestAnimationFrame(() => printDocument(withColors && hasColors))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const model = buildModel(editor, title, withColors && hasColors)
      const suffix = withColors && hasColors ? ` (${view.mode})` : ''
      if (kind === 'pdf') await (await import('../export/pdf')).downloadPdf(model, `${base}${suffix}.pdf`)
      else await (await import('../export/docx')).downloadDocx(model, `${base}${suffix}.docx`)
      onClose()
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : 'Export failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={ref} className="dialog export-dialog" onClose={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <h2>{COPY[kind].title}</h2>
      <div className="export-options" role="radiogroup" aria-label="Colors">
        <label className={`export-option${withColors && hasColors ? ' is-on' : ''}${hasColors ? '' : ' is-disabled'}`}>
          <input type="radio" name="colors" checked={withColors && hasColors} disabled={!hasColors} onChange={() => setWithColors(true)} />
          <span>
            <strong>With analysis colors</strong>
            <span className="muted small">
              {hasColors ? `Current ${view.mode} highlights, plus a color legend at the end.` : 'Turn on Tension or Argument highlights to include colors.'}
            </span>
            {hasColors && legend && (
              <span className="export-legend">
                {legend.items.map((it) => (
                  <span key={it.label} className="export-chip" style={{ background: it.color }}>{it.label}</span>
                ))}
              </span>
            )}
          </span>
        </label>
        <label className={`export-option${!withColors || !hasColors ? ' is-on' : ''}`}>
          <input type="radio" name="colors" checked={!withColors || !hasColors} onChange={() => setWithColors(false)} />
          <span>
            <strong>Plain</strong>
            <span className="muted small">Just your text and formatting.</span>
          </span>
        </label>
      </div>
      {kind === 'pdf' && <p className="muted small">PDF text uses Roboto; other fonts are substituted.</p>}
      {kind === 'print' && withColors && hasColors && <p className="muted small">If colors are missing, turn on “Background graphics” in the print dialog.</p>}
      {error && <p className="status-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="btn" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={run}>{busy ? 'Preparing…' : COPY[kind].action}</button>
      </div>
    </dialog>
  )
}

/** Legend block that only appears on color printouts. */
export function PrintLegend() {
  useSyncExternalStore(store.subscribe, store.getSnapshot)
  const legend = currentLegend()
  if (!legend) return null
  return (
    <div className="print-legend" aria-hidden>
      <strong>{legend.title}</strong>
      <span className="export-legend">
        {legend.items.map((it) => (
          <span key={it.label} className="export-chip" style={{ background: it.color }}>{it.label}</span>
        ))}
      </span>
    </div>
  )
}
