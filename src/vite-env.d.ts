/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" for the static GitHub Pages build (no server; bring-your-own-key). */
  readonly VITE_STATIC?: string
}
