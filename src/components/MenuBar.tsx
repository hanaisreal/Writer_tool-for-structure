import { useState } from 'react'

export type MenuItem = { label: string; shortcut?: string; action: () => void; disabled?: boolean; checked?: boolean } | 'sep'
export type Menu = { label: string; items: MenuItem[] }

export function MenuBar({ menus: getMenus }: { menus: () => Menu[] }) {
  const [open, setOpen] = useState<string | null>(null)
  // Built per render so enabled/checked states are fresh whenever a menu opens.
  const menus = getMenus()

  return (
    <nav className="menubar" aria-label="Menu">
      {open && <div className="menu-scrim" onMouseDown={() => setOpen(null)} />}
      {menus.map((m) => (
        <div key={m.label} className="menu-root">
          <button
            type="button"
            className={`menu-title${open === m.label ? ' is-open' : ''}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen(open === m.label ? null : m.label)}
            // Once one menu is open, hovering another switches to it (like Docs).
            onMouseEnter={() => open && setOpen(m.label)}
          >
            {m.label}
          </button>
          {open === m.label && (
            <div className="menu-list" role="menu">
              {m.items.map((it, i) =>
                it === 'sep' ? (
                  <div key={i} className="menu-sep" />
                ) : (
                  <button
                    key={it.label}
                    type="button"
                    role="menuitem"
                    className="menu-item"
                    disabled={it.disabled}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      setOpen(null)
                      it.action()
                    }}
                  >
                    <span className="menu-check">{it.checked ? '✓' : ''}</span>
                    <span className="menu-label">{it.label}</span>
                    {it.shortcut && <span className="menu-shortcut">{it.shortcut}</span>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </nav>
  )
}
