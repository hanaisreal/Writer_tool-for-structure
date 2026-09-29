import { useCallback, useEffect, useState } from 'react'

const KEY = 'tv.panelWidth.v1'
export const PANEL_DEFAULT = 320
export const PANEL_MIN = 260

/** Widest the panel may get: leave the page at least ~360px. */
export const panelMax = () => Math.max(PANEL_MIN, Math.min(900, window.innerWidth - 360))

const clamp = (w: number) => Math.round(Math.max(PANEL_MIN, Math.min(panelMax(), w)))

/** Panel width in px, remembered per browser and re-clamped when the window shrinks. */
export function usePanelWidth() {
  const [width, setWidthRaw] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(KEY))
      return saved ? clamp(saved) : PANEL_DEFAULT
    } catch {
      return PANEL_DEFAULT
    }
  })

  const setWidth = useCallback((w: number) => {
    const next = clamp(w)
    setWidthRaw(next)
    try {
      localStorage.setItem(KEY, String(next))
    } catch {
      // Non-essential.
    }
  }, [])

  useEffect(() => {
    const onResize = () => setWidthRaw((w) => clamp(w))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return [width, setWidth] as const
}
