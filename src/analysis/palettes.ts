// Color packs for the highlights. A pack colors every axis and every role at
// once, so the set stays harmonious. Whatever the pack, fills are capped by
// `maxAlpha` below so black text on top always stays easy to read.

import type { AxisId, RoleId } from '../../shared/genres'

export interface Palette {
  id: string
  label: string
  axes: Record<AxisId, string>
  /** Negative end of the diverging valence axis. */
  valenceNeg: string
  roles: Record<RoleId, string>
}

export const PALETTES: Palette[] = [
  {
    id: 'highlighter',
    label: 'Highlighter',
    axes: { stakes: '#FF4F8B', uncertainty: '#A57CFF', surprise: '#FFD600', pace: '#29B6F6', density: '#64DD17', valence: '#1DE9B6' },
    valenceNeg: '#FF7043',
    roles: { thesis: '#A57CFF', point: '#29B6F6', evidence: '#64DD17', analysis: '#FFD600', counter: '#FF4F8B', rebuttal: '#FF9100', link: '#1DE9B6' },
  },
  {
    id: 'pastel',
    label: 'Pastel',
    axes: { stakes: '#F28B82', uncertainty: '#C58AF9', surprise: '#FDD663', pace: '#8AB4F8', density: '#81C995', valence: '#78D9EC' },
    valenceNeg: '#F6AEA9',
    roles: { thesis: '#C58AF9', point: '#8AB4F8', evidence: '#81C995', analysis: '#FDD663', counter: '#F28B82', rebuttal: '#FCAD70', link: '#78D9EC' },
  },
  {
    id: 'classic',
    label: 'Classic',
    axes: { stakes: '#E5484D', uncertainty: '#8E4EC6', surprise: '#E38A00', pace: '#3E63DD', density: '#30A46C', valence: '#12A594' },
    valenceNeg: '#E93D82',
    roles: { thesis: '#6E56CF', point: '#0090FF', evidence: '#30A46C', analysis: '#E38A00', counter: '#E5484D', rebuttal: '#F76B15', link: '#12A594' },
  },
  {
    id: 'colorblind',
    label: 'Colorblind-safe',
    // Okabe–Ito: distinguishable under the common forms of color vision deficiency.
    axes: { stakes: '#D55E00', uncertainty: '#CC79A7', surprise: '#E69F00', pace: '#0072B2', density: '#009E73', valence: '#56B4E9' },
    valenceNeg: '#D55E00',
    roles: { thesis: '#CC79A7', point: '#0072B2', evidence: '#009E73', analysis: '#F0E442', counter: '#D55E00', rebuttal: '#E69F00', link: '#56B4E9' },
  },
]

export function getPalette(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? PALETTES[0]
}

// ---- Readability cap ----

const channel = (c: number) => {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
}

function luminanceOver(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => c * alpha + 255 * (1 - alpha)
  return 0.2126 * channel(mix((n >> 16) & 255)) + 0.7152 * channel(mix((n >> 8) & 255)) + 0.0722 * channel(mix(n & 255))
}

/**
 * Black text needs the background's relative luminance to stay at or above
 * this for a ~13:1 contrast ratio. WCAG AAA only asks for 7:1, but the
 * earlier 7:1-ish fills still read as too heavy for long passages of text.
 */
const MIN_BG_LUMINANCE = 0.6
const cache = new Map<string, number>()

/** Strongest opacity for `hex` over white that keeps black text readable. */
export function maxAlpha(hex: string): number {
  let a = cache.get(hex)
  if (a !== undefined) return a
  let lo = 0
  let hi = 1
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    if (luminanceOver(hex, mid) >= MIN_BG_LUMINANCE) lo = mid
    else hi = mid
  }
  // Even light colors stop short of a solid block, which glares across a full page.
  a = Math.min(0.85, lo)
  cache.set(hex, a)
  return a
}

/** Blend a color at `alpha` over white into an opaque hex — PDF, Word and print have no alpha. */
export function flatten(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16)
  const ch = (c: number) => Math.round(c * alpha + 255 * (1 - alpha)).toString(16).padStart(2, '0')
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`
}

/** The color at its readability cap, as an opaque hex — for legends and chips. */
export const tint = (hex: string) => flatten(hex, maxAlpha(hex))
