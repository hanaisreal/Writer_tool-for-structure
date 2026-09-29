// Word (.docx) export via the `docx` library, loaded on demand. Analysis
// colors become run shading, which Word shows exactly like a highlight but in
// any color (Word's own highlight feature only has 16 fixed colors).

import type { ExportModel, Run } from './model'

const hex = (c: string | undefined) => c?.replace('#', '').toUpperCase()

export async function downloadDocx(model: ExportModel, filename: string) {
  const d = await import('docx')

  const runOf = (r: Run) =>
    r.text === '\n'
      ? new d.TextRun({ break: 1 })
      : new d.TextRun({
          text: r.text,
          bold: r.bold,
          italics: r.italic,
          underline: r.underline ? {} : undefined,
          strike: r.strike,
          color: hex(r.color),
          size: r.fontSize ? Math.round(r.fontSize * 2) : undefined,
          font: r.font,
          shading: r.background ? { type: d.ShadingType.CLEAR, color: 'auto', fill: hex(r.background)! } : undefined,
          style: r.link ? 'Hyperlink' : undefined,
        })

  const children = (runs: Run[]) =>
    runs.map((r) => (r.link && r.text !== '\n' ? new d.ExternalHyperlink({ link: r.link, children: [runOf(r)] }) : runOf(r)))

  const HEADINGS = { h1: d.HeadingLevel.HEADING_1, h2: d.HeadingLevel.HEADING_2, h3: d.HeadingLevel.HEADING_3 } as const
  const ALIGN = { left: d.AlignmentType.LEFT, center: d.AlignmentType.CENTER, right: d.AlignmentType.RIGHT, justify: d.AlignmentType.JUSTIFIED } as const

  const paragraphs = model.blocks.map((b) => {
    if (b.type === 'hr') {
      return new d.Paragraph({ border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: 'A0A0A0', space: 1 } } })
    }
    return new d.Paragraph({
      children: children(b.runs),
      heading: b.type === 'p' ? undefined : HEADINGS[b.type],
      alignment: ALIGN[b.align],
      bullet: b.list?.kind === 'bullet' ? { level: b.list.level } : undefined,
      numbering: b.list?.kind === 'ordered' ? { reference: 'ordered', level: b.list.level, instance: b.list.listId } : undefined,
      // Continuation paragraphs inside list items line up with the item text.
      indent: !b.list && b.indent ? { left: 720 * b.indent } : b.quote ? { left: 480 } : undefined,
      border: b.quote ? { left: { style: d.BorderStyle.SINGLE, size: 12, color: 'DADCE0', space: 12 } } : undefined,
      spacing: { after: b.list || b.indent ? 60 : 200 },
    })
  })

  if (model.legend?.items.length) {
    paragraphs.push(
      new d.Paragraph({ spacing: { before: 360, after: 80 }, children: [new d.TextRun({ text: model.legend.title, bold: true, size: 16, color: '5F6368' })] }),
      new d.Paragraph({
        children: model.legend.items.flatMap((it) => [
          new d.TextRun({ text: ` ${it.label} `, size: 16, shading: { type: d.ShadingType.CLEAR, color: 'auto', fill: hex(it.color)! } }),
          new d.TextRun({ text: '   ', size: 16 }),
        ]),
      }),
    )
  }

  const level = (i: number, format: (typeof d.LevelFormat)[keyof typeof d.LevelFormat], text: string) => ({
    level: i,
    format,
    text,
    alignment: d.AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 720 * (i + 1), hanging: 360 } } },
  })

  const doc = new d.Document({
    title: model.title,
    creator: 'Tension',
    styles: {
      default: { document: { run: { font: 'Arial', size: 22 }, paragraph: { spacing: { line: 300 } } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 40, color: '000000' }, paragraph: { spacing: { before: 400, after: 120 } } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 32, color: '000000' }, paragraph: { spacing: { before: 360, after: 120 } } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { size: 28, color: '434343' }, paragraph: { spacing: { before: 320, after: 80 } } },
      ],
    },
    numbering: {
      config: [
        {
          reference: 'ordered',
          levels: [level(0, d.LevelFormat.DECIMAL, '%1.'), level(1, d.LevelFormat.LOWER_LETTER, '%2.'), level(2, d.LevelFormat.LOWER_ROMAN, '%3.')],
        },
      ],
    },
    sections: [{ properties: { page: { margin: { top: 1440, bottom: 1440, left: 1440, right: 1440 } } }, children: paragraphs }],
  })

  const blob = await d.Packer.toBlob(doc)
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}
