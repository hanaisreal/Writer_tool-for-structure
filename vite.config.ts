import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const api = `http://localhost:${process.env.API_PORT ?? 8787}`

// https://vite.dev/config/
export default defineConfig({
  // GitHub Pages serves the site under /<repo>/; set VITE_BASE for that build.
  base: process.env.VITE_BASE ?? '/',
  plugins: [react()],
  // pdfmake and its fonts are big but lazy-loaded only on export.
  build: { chunkSizeWarningLimit: 1200 },
  // Export libraries are imported lazily; pre-bundle them so the first export
  // doesn't make the dev server re-optimize and reload the page mid-click.
  optimizeDeps: {
    include: ['pdfmake/build/pdfmake', 'pdfmake/build/vfs_fonts', 'docx'],
  },
  server: {
    port: 5173,
    strictPort: true,
    // The Express server owns /api and /auth; proxying keeps the session cookie same-origin.
    proxy: {
      '/api': api,
      '/auth': api,
    },
  },
})
