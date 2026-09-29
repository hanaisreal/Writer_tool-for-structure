// Inline feedback comments. Categories follow the writing-center order of
// concerns: higher-order issues (structure, argument) before sentence-level
// ones (clarity, concision, grammar), plus praise — what to keep.

export const COMMENT_CATEGORIES = [
  { id: 'structure', label: 'Structure & flow', color: '#6E56CF', order: 'higher', hint: 'Paragraph focus, order, transitions' },
  { id: 'argument', label: 'Argument & evidence', color: '#0090FF', order: 'higher', hint: 'Claims, support, reasoning, counterarguments' },
  { id: 'clarity', label: 'Clarity & expression', color: '#E38A00', order: 'lower', hint: 'Ambiguity, awkward phrasing, word choice' },
  { id: 'concision', label: 'Concision', color: '#30A46C', order: 'lower', hint: 'Filler, hedging, redundancy' },
  { id: 'grammar', label: 'Grammar & mechanics', color: '#E5484D', order: 'lower', hint: 'Grammar, punctuation, spelling, usage' },
  { id: 'praise', label: 'What works', color: '#12A594', order: 'lower', hint: 'Strengths worth keeping' },
] as const

export type CommentCategoryId = (typeof COMMENT_CATEGORIES)[number]['id']
export const COMMENT_CATEGORY_IDS = COMMENT_CATEGORIES.map((c) => c.id) as CommentCategoryId[]
export const getCategory = (id: CommentCategoryId) => COMMENT_CATEGORIES.find((c) => c.id === id)!

/** What a comment is attached to. */
export type CommentScope = 'word' | 'sentence' | 'paragraph'

export interface DraftComment {
  category: CommentCategoryId
  scope: CommentScope
  priority: 'high' | 'medium' | 'low'
  /** Index of the paragraph the anchor is in. */
  paragraph: number
  /** Verbatim anchor text; for paragraph scope, the paragraph's opening words. */
  quote: string
  /** The observation and why it matters. */
  message: string
  /** Feed-forward: the concrete next step. */
  nextStep: string
  /** Optional replacement for `quote` the writer can apply in one click. */
  suggestion: string
}

export interface CommentsRequest {
  genre: string
  title: string
  paragraphs: string[]
  /** Upper bound; research finds fewer, prioritized comments help writers more. */
  maxComments: number
}

export interface CommentsResponse {
  comments: DraftComment[]
}
