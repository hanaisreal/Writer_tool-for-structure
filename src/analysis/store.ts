// Single source of truth for analysis results and view settings. Plain
// subscribe/getSnapshot so React (useSyncExternalStore) and the ProseMirror
// decoration plugin can both read it without a state library.

import type { CommentCategoryId } from '../../shared/comments'
import { AXIS_IDS, ROLE_IDS, type AxisId, type EvaluateResponse, type RoleId, type RoleSegment, type SentenceScores } from '../../shared/genres'

export type Mode = 'off' | 'tension' | 'argument'

export interface SentenceResult {
  scores: SentenceScores
  segments: RoleSegment[]
  note: string
  /** Which AI produced it ("Claude", "OpenAI"), for crediting in the UI. */
  by?: string
}

export interface ViewSettings {
  mode: Mode
  genre: string
  axes: Record<AxisId, boolean>
  roles: Record<RoleId, boolean>
  /** Multiplier on highlight opacity, 0.3..1; 1 = the palette's readability cap. */
  strength: number
  /** Color pack id from palettes.ts. */
  palette: string
  showTags: boolean
  /** Shade each axis relative to this document's own min..max instead of absolute scores. */
  relative: boolean
  /**
   * Tension: only sentences at or above this level are highlighted (0..1). With
   * `relative`, it is a percentile — 0.75 highlights the top quarter.
   */
  threshold: number
  /** Argument: spans whose role strength is below this stay unpainted (0..1). */
  roleThreshold: number
  /** Inline comments: shown at all, and which categories. */
  showComments: boolean
  commentCats: Partial<Record<CommentCategoryId, boolean>>
  /** Established rubric the Score tab grades against. */
  rubric: string
  /** How many comments to ask for: a few prioritized ones, or a thorough pass. */
  commentAmount: 'focused' | 'thorough'
}

export interface Status {
  llm: 'unknown' | 'ready' | 'disabled'
  queued: number
  running: number
  error: string | null
  /** The last error was an authentication problem the visitor can fix with a key. */
  needsKey: boolean
  /** Where AI requests go; null when no AI is available. */
  backend: 'server' | 'browser' | null
}

export interface Evaluation {
  /** Hash of the document text it was computed for. */
  hash: string
  result: EvaluateResponse
  by?: string
}

interface State {
  view: ViewSettings
  status: Status
  /** Last whole-essay Score evaluation from the AI. */
  evaluation: Evaluation | null
  /** Bumped on any results change so subscribers can cheaply detect it. */
  version: number
}

const SETTINGS_KEY = 'tv.view.v1'

function loadView(): ViewSettings {
  const base: ViewSettings = {
    mode: 'tension',
    genre: 'essay',
    axes: Object.fromEntries(AXIS_IDS.map((a) => [a, a === 'surprise'])) as Record<AxisId, boolean>,
    roles: Object.fromEntries(ROLE_IDS.map((r) => [r, true])) as Record<RoleId, boolean>,
    strength: 0.85,
    palette: 'highlighter',
    showTags: true,
    relative: true,
    threshold: 0.75,
    roleThreshold: 0.4,
    showComments: true,
    commentCats: {},
    rubric: 'ap-lang-argument',
    commentAmount: 'focused',
  }
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? 'null')
    // strength's range shrank to 0.3..1 when palettes gained readability caps.
    if (saved) return { ...base, ...saved, strength: Math.min(1, saved.strength ?? base.strength), axes: { ...base.axes, ...saved.axes }, roles: { ...base.roles, ...saved.roles } }
  } catch {
    // Storage unavailable or corrupt: fall back to defaults.
  }
  return base
}

class AnalysisStore {
  private state: State = {
    view: loadView(),
    status: { llm: 'unknown', queued: 0, running: 0, error: null, needsKey: false, backend: null },
    evaluation: null,
    version: 0,
  }
  private listeners = new Set<() => void>()
  /** AI results keyed by `${genre}:${sentenceHash}`. */
  private llm = new Map<string, SentenceResult>()

  subscribe = (fn: () => void) => {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  getSnapshot = () => this.state

  private emit(next: Partial<State>) {
    this.state = { ...this.state, ...next }
    this.listeners.forEach((fn) => fn())
  }

  setView(patch: Partial<ViewSettings>) {
    const view = { ...this.state.view, ...patch }
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(view))
    } catch {
      // Non-essential: settings just won't persist.
    }
    this.emit({ view })
  }

  setStatus(patch: Partial<Status>) {
    this.emit({ status: { ...this.state.status, ...patch } })
  }

  setEvaluation(evaluation: Evaluation) {
    this.emit({ evaluation })
  }

  getResult(hash: string): SentenceResult | undefined {
    return this.llm.get(`${this.state.view.genre}:${hash}`)
  }

  hasResult(hash: string) {
    return this.llm.has(`${this.state.view.genre}:${hash}`)
  }

  putResults(genre: string, entries: [string, SentenceResult][]) {
    for (const [hash, r] of entries) this.llm.set(`${genre}:${hash}`, r)
    this.emit({ version: this.state.version + 1 })
  }

  /** AI results for one genre, as [sentenceHash, result] pairs — used to bake the site example. */
  exportResults(genre: string): [string, SentenceResult][] {
    const prefix = `${genre}:`
    return [...this.llm].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => [k.slice(prefix.length), v])
  }

  clearResults() {
    this.llm.clear()
    this.emit({ version: this.state.version + 1 })
  }
}

export const store = new AnalysisStore()
