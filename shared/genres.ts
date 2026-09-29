// Genre profiles: which tension axes and argument roles exist, how they look,
// and how the LLM should score them. Shared by the client (legend, colors) and
// the server (prompt text), so the two can never drift apart.

export const AXIS_IDS = ['stakes', 'uncertainty', 'surprise', 'pace', 'density', 'valence'] as const
export type AxisId = (typeof AXIS_IDS)[number]

export const ROLE_IDS = ['thesis', 'point', 'evidence', 'analysis', 'counter', 'rebuttal', 'link'] as const
export type RoleId = (typeof ROLE_IDS)[number]

export interface AxisDef {
  id: AxisId
  label: string
  color: string
  /** Diverging axes (valence) are scored -1..1 and use `negColor` below zero. */
  negColor?: string
  /** Inverted axes highlight the *low* end — for density, the loose sentences are the actionable ones. */
  invert?: boolean
  /** One-line hint shown in the panel. */
  hint: string
  /** Scoring rubric handed to the model. */
  rubric: string
}

export interface RoleDef {
  id: RoleId
  label: string
  /** Two-letter tag drawn before each span when labels are on. */
  tag: string
  color: string
  hint: string
  rubric: string
}

export interface GenreProfile {
  id: string
  label: string
  available: boolean
  /** Framing for the model: what "tension" means in this genre. */
  framing: string
  axes: AxisDef[]
  roles: RoleDef[]
  /** Healthy share of the essay's words per role (0..1), for the balance chart. */
  balance: Partial<Record<RoleId | 'none', [number, number]>>
}


const essayAxes: AxisDef[] = [
  {
    id: 'stakes',
    label: 'Stakes',
    color: '#E5484D',
    hint: 'Why this matters; what is at risk',
    rubric:
      '0 = nothing is at stake; 0.5 = a clear consequence or cost is implied; 1 = the sentence makes the reader feel something important will be won or lost.',
  },
  {
    id: 'uncertainty',
    label: 'Uncertainty',
    color: '#8E4EC6',
    hint: 'Open questions the reader is holding',
    rubric:
      'How strongly the reader is left holding an unresolved question at this point (a problem posed, a doubt raised, an objection not yet answered). Resolving sentences score low. 0 = fully settled; 1 = a pressing open question.',
  },
  {
    id: 'surprise',
    label: 'Surprise',
    color: '#E38A00',
    hint: 'Breaks expectation; counter-intuitive turns',
    rubric:
      'How much this sentence departs from what the reader would predict given everything before it: counter-intuitive claims, reversals, unexpected evidence. 0 = entirely predictable; 1 = a genuine turn.',
  },
  {
    id: 'pace',
    label: 'Pace',
    color: '#3E63DD',
    hint: 'How fast the argument moves',
    rubric:
      'How quickly the argument advances in this sentence. Short, forceful moves and new steps score high; lingering, qualifying, or restating scores low. 0 = stalled; 1 = rapid.',
  },
  {
    id: 'density',
    label: 'Density',
    color: '#30A46C',
    invert: true,
    hint: 'Highlights loose, padded sentences',
    rubric:
      'Information per word. 1 = tight: every word earns its place. 0 = padded: filler, hedging, redundancy, throat-clearing, or restating what was already said.',
  },
  {
    id: 'valence',
    label: 'Valence',
    color: '#12A594',
    negColor: '#E93D82',
    hint: 'Emotional charge: negative ↔ positive',
    rubric:
      'Emotional direction and strength of the sentence. -1 = strongly negative (alarm, loss, anger); 0 = neutral; 1 = strongly positive (hope, relief, triumph).',
  },
]

// Word-share bands for a typical argumentative essay. Guides, not rules.
const essayBalance: GenreProfile['balance'] = {
  thesis: [0.03, 0.1],
  point: [0.08, 0.2],
  evidence: [0.18, 0.35],
  analysis: [0.22, 0.42],
  counter: [0.04, 0.12],
  rebuttal: [0.04, 0.14],
  link: [0.04, 0.12],
  none: [0, 0.1],
}

const essayRoles: RoleDef[] = [
  {
    id: 'thesis',
    label: 'Thesis',
    tag: 'TH',
    color: '#6E56CF',
    hint: 'The central claim of the whole piece',
    rubric: 'The central claim the entire essay argues for. Usually appears once or twice.',
  },
  {
    id: 'point',
    label: 'Point',
    tag: 'PT',
    color: '#0090FF',
    hint: 'A claim this paragraph makes (P)',
    rubric: 'A claim or topic assertion that a paragraph sets out to support.',
  },
  {
    id: 'evidence',
    label: 'Evidence',
    tag: 'EV',
    color: '#30A46C',
    hint: 'Data, examples, quotes, cases (E)',
    rubric: 'Facts, data, examples, anecdotes, citations, or quotations offered as support.',
  },
  {
    id: 'analysis',
    label: 'Analysis',
    tag: 'AN',
    color: '#E38A00',
    hint: 'How the evidence supports the point (A)',
    rubric: 'Reasoning that explains how or why the evidence supports the point.',
  },
  {
    id: 'counter',
    label: 'Counterargument',
    tag: 'CA',
    color: '#E5484D',
    hint: 'An opposing view the essay raises',
    rubric: 'A position or objection opposed to the author, stated so it can be addressed.',
  },
  {
    id: 'rebuttal',
    label: 'Rebuttal',
    tag: 'RB',
    color: '#F76B15',
    hint: 'The response to an opposing view (R)',
    rubric: 'The author answering, conceding, or refuting a counterargument.',
  },
  {
    id: 'link',
    label: 'Link / Conclusion',
    tag: 'LK',
    color: '#12A594',
    hint: 'Ties back to the thesis or concludes',
    rubric: 'Connects a paragraph back to the thesis, transitions, or draws the conclusion.',
  },
]

export const GENRES: GenreProfile[] = [
  {
    id: 'essay',
    label: 'Essay / Opinion',
    available: true,
    framing:
      'This is an argumentative essay or opinion piece. Tension here is intellectual: the reader is pulled forward by what is at stake, by open questions and unanswered objections, and by claims that overturn their expectations.',
    axes: essayAxes,
    roles: essayRoles,
    balance: essayBalance,
  },
  {
    id: 'fiction',
    label: 'Fiction (coming soon)',
    available: false,
    framing: '',
    axes: essayAxes,
    roles: essayRoles,
    balance: essayBalance,
  },
]

export function getGenre(id: string): GenreProfile {
  return GENRES.find((g) => g.id === id && g.available) ?? GENRES[0]
}

// ---- Wire types for /api/analyze ----

export interface AnalyzeRequest {
  genre: string
  title: string
  /** Every paragraph of the document, in order, for context. */
  paragraphs: string[]
  /** Index into `paragraphs` of the paragraph to score. */
  target: number
  /** The target paragraph's sentences, with ids the response echoes back. */
  sentences: { id: string; text: string }[]
}

/** 'none' marks text with no argumentative job (filler, throat-clearing). */
export type SegmentRole = RoleId | 'none'

export interface RoleSegment {
  text: string
  role: SegmentRole
  /** 0..1: how clearly and effectively this span does its job. */
  strength: number
}

export interface SentenceScores {
  stakes: number
  uncertainty: number
  surprise: number
  pace: number
  density: number
  valence: number
}

export interface AnalyzedSentence extends SentenceScores {
  id: string
  segments: RoleSegment[]
  note: string
}

export interface AnalyzeResponse {
  sentences: AnalyzedSentence[]
}

export interface MeResponse {
  authEnabled: boolean
  llmEnabled: boolean
  model: string | null
  user: { name: string; email: string; picture?: string } | null
}

// ---- Wire types for /api/evaluate ----

export interface EvaluateRequest {
  genre: string
  title: string
  paragraphs: string[]
  /** Which established rubric to grade against (shared/rubrics.ts). */
  rubric: string
}

/** Concise, holistic grade; detailed feedback lives in inline comments. */
export interface EvaluateResponse {
  rubric: string
  /** Two sentences at most: the main strength and the biggest problem. */
  summary: string
  scores: { id: string; score: number; reason: string }[]
  /** The three revisions that would raise the score most, highest first. */
  nextSteps: { title: string; detail: string; quote: string }[]
}
