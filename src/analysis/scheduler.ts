// Decides what to send to Claude and when. Only paragraphs containing
// sentences without a cached result are re-analyzed, a short pause after the
// last keystroke, a few paragraphs at a time.

import type { Editor } from '@tiptap/core'
import type { AnalyzeRequest } from '../../shared/genres'
import { analyzeParagraph, LlmError } from '../llm/provider'
import { highlightKey } from './highlight'
import { hashText } from './segment'
import { store, type SentenceResult } from './store'

const DEBOUNCE_MS = 1200
const CONCURRENCY = 3

interface Job {
  key: string
  genre: string
  body: AnalyzeRequest
  /** Response id → sentence hash. */
  ids: Map<string, string>
}

export class AnalysisScheduler {
  private editor: Editor | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private queue: Job[] = []
  private running = 0
  /** `${genre}:${hash}` currently queued or in flight. */
  private inflight = new Set<string>()
  /** Hashes that failed; skipped until the user retries so errors don't loop. */
  private failed = new Set<string>()
  getTitle: () => string = () => ''

  attach(editor: Editor) {
    this.editor = editor
    editor.on('update', this.onChange)
    return () => {
      editor.off('update', this.onChange)
      clearTimeout(this.timer)
    }
  }

  onChange = () => {
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.scan(), DEBOUNCE_MS)
  }

  retry() {
    this.failed.clear()
    store.setStatus({ error: null, needsKey: false })
    this.scan()
  }

  reanalyzeAll() {
    this.failed.clear()
    store.clearResults()
    store.setStatus({ error: null, needsKey: false })
    this.scan()
  }

  scan = () => {
    const editor = this.editor
    if (!editor || editor.isDestroyed || store.getSnapshot().status.llm !== 'ready') return
    const seg = highlightKey.getState(editor.state)?.seg
    if (!seg) return
    const { genre } = store.getSnapshot().view
    const paragraphs = seg.paragraphs.map((p) => p.text)

    seg.paragraphs.forEach((p, target) => {
      const missing = p.sentences.filter((s) => {
        const k = `${genre}:${s.hash}`
        return !store.hasResult(s.hash) && !this.inflight.has(k) && !this.failed.has(k)
      })
      if (!missing.length) return
      const ids = new Map<string, string>()
      const sentences = p.sentences.map((s, i) => {
        ids.set(`s${i}`, s.hash)
        return { id: `s${i}`, text: s.text }
      })
      p.sentences.forEach((s) => this.inflight.add(`${genre}:${s.hash}`))
      this.queue.push({
        key: `${genre}:${hashText(p.text)}`,
        genre,
        ids,
        body: { genre, title: this.getTitle(), paragraphs, target, sentences },
      })
    })
    this.pump()
  }

  private pump() {
    store.setStatus({ queued: this.queue.length, running: this.running })
    while (this.running < CONCURRENCY && this.queue.length) {
      const job = this.queue.shift()!
      this.running++
      this.run(job).finally(() => {
        this.running--
        for (const hash of job.ids.values()) this.inflight.delete(`${job.genre}:${hash}`)
        this.pump()
      })
    }
  }

  private async run(job: Job) {
    try {
      const data = await analyzeParagraph(job.body)
      const entries: [string, SentenceResult][] = []
      for (const s of data.sentences) {
        const hash = job.ids.get(s.id)
        if (!hash) continue
        const { stakes, uncertainty, surprise, pace, density, valence, segments, note } = s
        entries.push([hash, { scores: { stakes, uncertainty, surprise, pace, density, valence }, segments, note }])
      }
      store.putResults(job.genre, entries)
    } catch (err) {
      for (const hash of job.ids.values()) this.failed.add(`${job.genre}:${hash}`)
      // Edits keep triggering analysis for new text; the panel offers a retry for these.
      store.setStatus({ error: err instanceof Error ? err.message : String(err), needsKey: err instanceof LlmError && err.kind === 'auth' })
    }
  }
}

export const scheduler = new AnalysisScheduler()
