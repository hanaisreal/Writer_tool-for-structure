import type { Editor } from '@tiptap/react'
import { useEditorState } from '@tiptap/react'
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Highlighter,
  IndentDecrease,
  IndentIncrease,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Plus,
  Printer,
  Redo2,
  RemoveFormatting,
  Search,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { DEFAULT_FONT, DEFAULT_SIZE, FONTS, FONT_SIZES } from '../editor/extensions'
import { promptLink } from '../editor/link'
import { Popover } from './Popover'

const PALETTE = [
  '#000000', '#434343', '#666666', '#999999', '#B7B7B7', '#CCCCCC', '#D9D9D9', '#FFFFFF',
  '#980000', '#FF0000', '#FF9900', '#FFFF00', '#00FF00', '#00FFFF', '#4A86E8', '#0000FF',
  '#9900FF', '#FF00FF', '#E6B8AF', '#F4CCCC', '#FCE5CD', '#FFF2CC', '#D9EAD3', '#D0E0E3',
  '#C9DAF8', '#CFE2F3', '#D9D2E9', '#EAD1DC', '#CC4125', '#E06666', '#F6B26B', '#FFD966',
]

function Btn(props: { label: string; active?: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`tb-btn${props.active ? ' is-active' : ''}`}
      title={props.label}
      aria-label={props.label}
      aria-pressed={props.active}
      disabled={props.disabled}
      // Keep the editor selection when clicking toolbar buttons.
      onMouseDown={(e) => e.preventDefault()}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}

const Sep = () => <span className="tb-sep" aria-hidden />

function ColorButton(props: { label: string; icon: ReactNode; current: string | null; onPick: (c: string | null) => void; noneLabel: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      trigger={
        <button type="button" className="tb-btn tb-color" title={props.label} aria-label={props.label} onMouseDown={(e) => e.preventDefault()} onClick={() => setOpen(!open)}>
          {props.icon}
          <span className="tb-color-bar" style={{ background: props.current ?? 'transparent' }} />
        </button>
      }
    >
      <div className="color-menu">
        <button type="button" className="color-none" onMouseDown={(e) => e.preventDefault()} onClick={() => (props.onPick(null), setOpen(false))}>
          {props.noneLabel}
        </button>
        <div className="color-grid">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              className="color-swatch"
              style={{ background: c }}
              title={c}
              aria-label={c}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => (props.onPick(c), setOpen(false))}
            />
          ))}
        </div>
      </div>
    </Popover>
  )
}

export function Toolbar({ editor, zoom, setZoom, onFind, onPrint }: { editor: Editor; zoom: number; setZoom: (z: number) => void; onFind: () => void; onPrint: () => void }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const ts = e.getAttributes('textStyle')
      return {
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
        block: e.isActive('heading', { level: 1 })
          ? 'h1'
          : e.isActive('heading', { level: 2 })
            ? 'h2'
            : e.isActive('heading', { level: 3 })
              ? 'h3'
              : 'p',
        font: (ts.fontFamily as string | undefined)?.replace(/["']/g, '') ?? DEFAULT_FONT,
        size: ts.fontSize ? parseFloat(ts.fontSize as string) : DEFAULT_SIZE,
        color: (ts.color as string | undefined) ?? null,
        highlight: (e.getAttributes('highlight').color as string | undefined) ?? null,
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        link: e.isActive('link'),
        align: (['left', 'center', 'right', 'justify'] as const).find((a) => e.isActive({ textAlign: a })) ?? 'left',
        bullet: e.isActive('bulletList'),
        ordered: e.isActive('orderedList'),
        inList: e.isActive('listItem'),
      }
    },
  })

  const chain = () => editor.chain().focus()
  const setSize = (pt: number) => chain().setFontSize(`${Math.max(1, Math.min(400, pt))}pt`).run()
  const bumpSize = (dir: 1 | -1) => {
    const next = dir > 0 ? FONT_SIZES.find((x) => x > s.size) : [...FONT_SIZES].reverse().find((x) => x < s.size)
    setSize(next ?? s.size + dir)
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <Btn label="Search (⌘F)" onClick={onFind}><Search size={16} /></Btn>
      <Btn label="Undo (⌘Z)" disabled={!s.canUndo} onClick={() => chain().undo().run()}><Undo2 size={16} /></Btn>
      <Btn label="Redo (⌘⇧Z)" disabled={!s.canRedo} onClick={() => chain().redo().run()}><Redo2 size={16} /></Btn>
      <Btn label="Print (⌘P)" onClick={onPrint}><Printer size={16} /></Btn>
      <select className="tb-select tb-zoom" aria-label="Zoom" value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
        {[50, 75, 90, 100, 125, 150, 200].map((z) => <option key={z} value={z}>{z}%</option>)}
      </select>
      <Sep />
      <select
        className="tb-select tb-style"
        aria-label="Styles"
        value={s.block}
        onChange={(e) => {
          const v = e.target.value
          if (v === 'p') chain().setParagraph().run()
          else chain().setHeading({ level: Number(v[1]) as 1 | 2 | 3 }).run()
        }}
      >
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <Sep />
      <select className="tb-select tb-font" aria-label="Font" value={FONTS.includes(s.font) ? s.font : DEFAULT_FONT} onChange={(e) => chain().setFontFamily(e.target.value).run()}>
        {FONTS.map((f) => <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>)}
      </select>
      <Sep />
      <Btn label="Decrease font size" onClick={() => bumpSize(-1)}><Minus size={14} /></Btn>
      <input
        key={s.size}
        className="tb-size"
        aria-label="Font size"
        defaultValue={s.size}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const n = parseFloat((e.target as HTMLInputElement).value)
            if (Number.isFinite(n)) setSize(n)
          }
        }}
      />
      <Btn label="Increase font size" onClick={() => bumpSize(1)}><Plus size={14} /></Btn>
      <Sep />
      <Btn label="Bold (⌘B)" active={s.bold} onClick={() => chain().toggleBold().run()}><Bold size={16} /></Btn>
      <Btn label="Italic (⌘I)" active={s.italic} onClick={() => chain().toggleItalic().run()}><Italic size={16} /></Btn>
      <Btn label="Underline (⌘U)" active={s.underline} onClick={() => chain().toggleUnderline().run()}><Underline size={16} /></Btn>
      <Btn label="Strikethrough (⌘⇧X)" active={s.strike} onClick={() => chain().toggleStrike().run()}><Strikethrough size={16} /></Btn>
      <ColorButton label="Text color" icon={<Baseline size={16} />} current={s.color ?? '#000000'} noneLabel="Reset" onPick={(c) => (c ? chain().setColor(c).run() : chain().unsetColor().run())} />
      <ColorButton label="Highlight color" icon={<Highlighter size={16} />} current={s.highlight} noneLabel="None" onPick={(c) => (c ? chain().setHighlight({ color: c }).run() : chain().unsetHighlight().run())} />
      <Sep />
      <Btn label="Insert link (⌘K)" active={s.link} onClick={() => promptLink(editor)}><Link2 size={16} /></Btn>
      <Sep />
      <Btn label="Left align (⌘⇧L)" active={s.align === 'left'} onClick={() => chain().setTextAlign('left').run()}><AlignLeft size={16} /></Btn>
      <Btn label="Center align (⌘⇧E)" active={s.align === 'center'} onClick={() => chain().setTextAlign('center').run()}><AlignCenter size={16} /></Btn>
      <Btn label="Right align (⌘⇧R)" active={s.align === 'right'} onClick={() => chain().setTextAlign('right').run()}><AlignRight size={16} /></Btn>
      <Btn label="Justify (⌘⇧J)" active={s.align === 'justify'} onClick={() => chain().setTextAlign('justify').run()}><AlignJustify size={16} /></Btn>
      <Sep />
      <Btn label="Bulleted list (⌘⇧8)" active={s.bullet} onClick={() => chain().toggleBulletList().run()}><List size={16} /></Btn>
      <Btn label="Numbered list (⌘⇧7)" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}><ListOrdered size={16} /></Btn>
      <Btn label="Decrease indent" disabled={!s.inList} onClick={() => chain().liftListItem('listItem').run()}><IndentDecrease size={16} /></Btn>
      <Btn label="Increase indent" disabled={!s.inList} onClick={() => chain().sinkListItem('listItem').run()}><IndentIncrease size={16} /></Btn>
      <Sep />
      <Btn label="Clear formatting (⌘\)" onClick={() => chain().unsetAllMarks().clearNodes().run()}><RemoveFormatting size={16} /></Btn>
    </div>
  )
}
