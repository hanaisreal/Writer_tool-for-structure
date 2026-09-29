import type { Editor } from '@tiptap/core'

/** Add, edit, or (with an empty URL) remove the link at the selection. */
export function promptLink(editor: Editor) {
  const prev = editor.getAttributes('link').href as string | undefined
  const url = window.prompt('Link URL', prev ?? 'https://')
  if (url === null) return
  const chain = editor.chain().focus().extendMarkRange('link')
  if (url.trim()) chain.setLink({ href: url.trim() }).run()
  else chain.unsetLink().run()
}
