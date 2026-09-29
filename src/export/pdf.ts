// Real-text PDF (selectable, searchable) via pdfmake. Loaded on demand — the
// embedded fonts are large and most sessions never export.

import type { Content, ContentText, TDocumentDefinitions } from 'pdfmake/interfaces'
import type { ExportModel, Run } from './model'

const SIZES = { p: 11, h1: 20, h2: 16, h3: 14 } as const
const BULLETS = ['•', '◦', '▪']

function toText(r: Run): ContentText | string {
  if (r.text === '\n') return '\n'
  const decoration = [r.underline || r.link ? 'underline' : null, r.strike ? 'lineThrough' : null].filter(Boolean) as ('underline' | 'lineThrough')[]
  return {
    text: r.text,
    bold: r.bold,
    italics: r.italic,
    decoration: decoration.length ? decoration : undefined,
    color: r.link ? '#1155cc' : r.color,
    background: r.background,
    fontSize: r.fontSize,
    link: r.link,
  }
}

export function pdfDefinition(model: ExportModel): TDocumentDefinitions {
  const content: Content[] = []
  for (const b of model.blocks) {
    if (b.type === 'hr') {
      content.push({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 468, y2: 0, lineWidth: 0.6, lineColor: '#a0a0a0' }], margin: [0, 6, 0, 10] })
      continue
    }
    const size = SIZES[b.type]
    const runs: (ContentText | string)[] = b.runs.map(toText)
    if (b.list) {
      const prefix = b.list.kind === 'bullet' ? BULLETS[b.list.level % BULLETS.length] : `${b.list.index}.`
      runs.unshift({ text: `${prefix}  ` })
    }
    const indent = Math.max(0, b.indent - (b.list ? 1 : 0)) * 18 + (b.list ? 18 : 0) + (b.quote ? 16 : 0)
    content.push({
      text: runs.length ? runs : ' ',
      fontSize: size,
      alignment: b.align,
      color: b.quote ? '#434343' : undefined,
      margin: [indent, b.type === 'p' ? 0 : size * 0.9, 0, b.list || b.indent ? 3 : b.type === 'p' ? 10 : 6],
    })
  }

  if (model.legend?.items.length) {
    content.push({ text: model.legend.title, fontSize: 8, bold: true, color: '#5f6368', margin: [0, 18, 0, 4] })
    content.push({
      text: model.legend.items.flatMap((it) => [{ text: ` ${it.label} `, background: it.color, fontSize: 8 }, { text: '   ', fontSize: 8 }]),
      lineHeight: 1.6,
    })
  }

  return {
    info: { title: model.title },
    pageSize: 'LETTER',
    pageMargins: [72, 72, 72, 72],
    defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.3 },
    content,
  }
}

export async function loadPdfMake() {
  const [pdfMakeMod, vfsMod] = await Promise.all([import('pdfmake/build/pdfmake'), import('pdfmake/build/vfs_fonts')])
  const pdfMake = (pdfMakeMod as unknown as { default?: typeof pdfMakeMod }).default ?? pdfMakeMod
  const vfs = (vfsMod as unknown as { default?: unknown }).default ?? vfsMod
  pdfMake.addVirtualFileSystem(vfs as Parameters<typeof pdfMake.addVirtualFileSystem>[0])
  return pdfMake
}

export async function downloadPdf(model: ExportModel, filename: string) {
  const pdfMake = await loadPdfMake()
  await pdfMake.createPdf(pdfDefinition(model)).download(filename)
}
