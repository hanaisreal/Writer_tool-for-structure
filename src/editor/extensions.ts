import type { Extensions } from '@tiptap/core'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { CharacterCount, Placeholder } from '@tiptap/extensions'
import StarterKit from '@tiptap/starter-kit'
import { TensionHighlight } from '../analysis/highlight'
import { FindReplace } from './findReplace'

export const FONTS = ['Arial', 'Georgia', 'Times New Roman', 'Merriweather', 'Lora', 'Roboto', 'Verdana', 'Courier New']
export const DEFAULT_FONT = 'Arial'
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 18, 24, 30, 36, 48, 60, 72, 96]
export const DEFAULT_SIZE = 11

export const extensions: Extensions = [
  StarterKit.configure({
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
  }),
  TextStyleKit.configure({ lineHeight: false, backgroundColor: false }),
  Highlight.configure({ multicolor: true }),
  TextAlign.configure({ types: ['heading', 'paragraph'] }),
  CharacterCount,
  Placeholder.configure({ placeholder: 'Start writing your essay…' }),
  FindReplace,
  TensionHighlight,
]
