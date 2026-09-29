import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Anchored popover, portaled to <body> with fixed positioning so it is never
 * clipped by a scrolling parent (the toolbar) or stacked under the page.
 * Closes on outside click or Escape.
 */
export function Popover(props: { open: boolean; onOpenChange: (open: boolean) => void; trigger: ReactNode; children: ReactNode; align?: 'left' | 'right' }) {
  const anchor = useRef<HTMLDivElement>(null)
  const pop = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const { open, onOpenChange, align = 'left' } = props

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const a = anchor.current?.getBoundingClientRect()
      const p = pop.current?.getBoundingClientRect()
      if (!a) return
      const width = p?.width ?? 0
      let left = align === 'right' ? a.right - width : a.left
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
      setPos({ top: a.bottom + 4, left })
    }
    place()
    // Second pass once the popover has a measured width.
    const raf = requestAnimationFrame(place)
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, align])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node
      if (!anchor.current?.contains(t) && !pop.current?.contains(t)) onOpenChange(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onOpenChange(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onOpenChange])

  return (
    <div className="popover-anchor" ref={anchor}>
      {props.trigger}
      {open &&
        createPortal(
          <div ref={pop} className="popover" style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}>
            {props.children}
          </div>,
          document.body,
        )}
    </div>
  )
}
