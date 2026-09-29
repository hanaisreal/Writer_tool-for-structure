// Established rubrics the Score tab grades against. Descriptors are short
// paraphrases of the published criteria (see `source`), written as guidance for
// the model; the official documents remain the authority.

import type { CommentCategoryId } from './comments.ts'

export interface Criterion {
  id: string
  label: string
  min: number
  max: number
  /** What earns the top of the scale vs. the bottom, paraphrased. */
  descriptor: string
  /** Comment categories that feed this criterion, for linking scores to comments. */
  categories: CommentCategoryId[]
}

export interface RubricSet {
  id: string
  label: string
  /** Short credit line and link to the published rubric. */
  source: string
  url: string
  /** How criterion scores combine into the overall score. */
  combine: 'sum' | 'mean'
  /** Granularity of each criterion score (IELTS allows half bands). */
  step: number
  /** Round the overall score to this step. */
  round: number
  criteria: Criterion[]
}

export const RUBRICS: RubricSet[] = [
  {
    id: 'ap-lang-argument',
    label: 'AP Lang — Argument',
    source: 'College Board, AP English Language and Composition, Argument essay scoring rubric (6 points)',
    url: 'https://apcentral.collegeboard.org/media/pdf/ap-english-language-and-composition-frqs-1-2-3-scoring-rubrics.pdf',
    combine: 'sum',
    step: 1,
    round: 1,
    criteria: [
      {
        id: 'thesis',
        label: 'Thesis',
        min: 0,
        max: 1,
        descriptor:
          '1 = states a defensible position that takes a clear stand. 0 = no defensible thesis: restates a topic, sits on the fence, or states an obvious fact.',
        categories: ['argument', 'structure'],
      },
      {
        id: 'evidence',
        label: 'Evidence & commentary',
        min: 0,
        max: 4,
        descriptor:
          '4 = specific, relevant evidence supports every claim, and commentary consistently explains how it advances a clear line of reasoning. 3 = specific evidence supports all claims; commentary explains some of it. 2 = some specific evidence, but commentary mostly repeats or summarizes; reasoning is thin. 1 = mostly general or repetitive evidence with little or no commentary. 0 = irrelevant or none.',
        categories: ['argument', 'structure'],
      },
      {
        id: 'sophistication',
        label: 'Sophistication',
        min: 0,
        max: 1,
        descriptor:
          '1 = consistently shows sophisticated thought or a complex grasp of the rhetorical situation — nuance, limitations or tensions acknowledged, broader implications, or a vivid, persuasive style throughout. 0 = does not, or only in passing.',
        categories: ['argument', 'clarity'],
      },
    ],
  },
  {
    id: 'ielts-task2',
    label: 'IELTS Writing Task 2',
    source: 'IELTS Writing Task 2 band descriptors (public version) — four criteria, bands 0–9',
    url: 'https://assets.ctfassets.net/unrdeg6se4ke/19SJoSvnUYjrHgVhWvuMnC/42f1b0cb0d7709646a1392d8418646d0/writingbanddescriptorstask1and2.pdf',
    combine: 'mean',
    step: 0.5,
    round: 0.5,
    criteria: [
      {
        id: 'task_response',
        label: 'Task response',
        min: 0,
        max: 9,
        descriptor:
          '9 = fully addresses the task with a clear, fully developed position and well-extended, supported ideas. 6 = addresses the task with a relevant position, though conclusions may be unclear and some ideas under-developed. 4 = only minimally addresses the task; position unclear; ideas hard to identify or unsupported.',
        categories: ['argument'],
      },
      {
        id: 'coherence_cohesion',
        label: 'Coherence & cohesion',
        min: 0,
        max: 9,
        descriptor:
          '9 = cohesion is so skillful it attracts no attention; paragraphing is fully effective. 6 = arranges information coherently with clear overall progression, but cohesive devices may be faulty or mechanical and paragraphing not always logical. 4 = information not arranged coherently; no clear progression.',
        categories: ['structure'],
      },
      {
        id: 'lexical_resource',
        label: 'Lexical resource',
        min: 0,
        max: 9,
        descriptor:
          '9 = wide, natural, sophisticated vocabulary; rare slips only. 6 = adequate range for the task; attempts less common words with some inaccuracy. 4 = limited, repetitive vocabulary; errors may strain the reader.',
        categories: ['clarity', 'concision'],
      },
      {
        id: 'grammar',
        label: 'Grammatical range & accuracy',
        min: 0,
        max: 9,
        descriptor:
          '9 = wide range of structures used with full flexibility and accuracy. 6 = mix of simple and complex forms; some errors that rarely impede communication. 4 = very limited range; frequent errors.',
        categories: ['grammar'],
      },
    ],
  },
  {
    id: 'six-traits',
    label: '6+1 Trait Writing',
    source: 'Education Northwest, 6+1 Trait® Writing — condensed 5-point writer’s rubric',
    url: 'https://educationnorthwest.org/resources/61-trait-rubrics',
    combine: 'mean',
    step: 1,
    round: 0.1,
    criteria: [
      { id: 'ideas', label: 'Ideas', min: 1, max: 5, descriptor: '5 = clear, focused main idea with rich, relevant supporting detail. 3 = recognizable idea, support general or uneven. 1 = no clear purpose or main idea.', categories: ['argument'] },
      { id: 'organization', label: 'Organization', min: 1, max: 5, descriptor: '5 = inviting opening, logical sequence, smooth transitions, satisfying ending. 3 = recognizable structure, predictable or uneven transitions. 1 = no identifiable structure.', categories: ['structure'] },
      { id: 'voice', label: 'Voice', min: 1, max: 5, descriptor: '5 = distinctive, engaged voice suited to audience and purpose. 3 = sincere but inconsistent or generic. 1 = flat, mechanical, or inappropriate.', categories: ['clarity'] },
      { id: 'word_choice', label: 'Word choice', min: 1, max: 5, descriptor: '5 = precise, vivid, natural words; nothing wasted. 3 = functional but ordinary; some imprecise or overused words. 1 = vague, repetitive, or misused words.', categories: ['clarity', 'concision'] },
      { id: 'sentence_fluency', label: 'Sentence fluency', min: 1, max: 5, descriptor: '5 = varied, rhythmic sentences that read easily aloud. 3 = mostly smooth; some monotony or awkwardness. 1 = choppy, rambling, or hard to follow.', categories: ['clarity', 'concision'] },
      { id: 'conventions', label: 'Conventions', min: 1, max: 5, descriptor: '5 = strong control of grammar, spelling, punctuation, and usage. 3 = errors noticeable but meaning clear. 1 = errors frequently impede reading.', categories: ['grammar'] },
      { id: 'presentation', label: 'Presentation', min: 1, max: 5, descriptor: '5 = formatting (title, headings, paragraphing, lists) aids the reader. 3 = acceptable but inconsistent. 1 = format hinders reading.', categories: ['structure'] },
    ],
  },
]

export const getRubric = (id: string) => RUBRICS.find((r) => r.id === id) ?? RUBRICS[0]

/** Combine criterion scores into the rubric's overall score. */
export function overallScore(rubric: RubricSet, scores: Record<string, number>): { value: number; max: number } {
  const vals = rubric.criteria.map((c) => scores[c.id] ?? c.min)
  if (rubric.combine === 'sum') {
    return { value: vals.reduce((a, b) => a + b, 0), max: rubric.criteria.reduce((a, c) => a + c.max, 0) }
  }
  const mean = vals.reduce((a, b) => a + b, 0) / (vals.length || 1)
  return { value: Math.round(mean / rubric.round) * rubric.round, max: rubric.criteria[0]?.max ?? 1 }
}
