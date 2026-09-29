/** Print with or without the analysis colors; the print stylesheet keys off this attribute. */
export function printDocument(withColors: boolean) {
  document.body.dataset.print = withColors ? 'color' : 'plain'
  const reset = () => {
    delete document.body.dataset.print
    window.removeEventListener('afterprint', reset)
  }
  window.addEventListener('afterprint', reset)
  window.print()
}
