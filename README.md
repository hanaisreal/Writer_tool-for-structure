# Tension — a writing editor that shows structure

A Google Docs–style editor that paints the **tension** and **argument structure** of your writing behind the text, grades the whole piece, and updates as you edit. Built for essays and opinion pieces.

**Try it:** https://hanaisreal.github.io/Writer_tool-for-structure/

## What it does

- **Tension highlights.** Six axes — Stakes, Uncertainty, Surprise, Pace, Density, Valence — each with its own color and on/off toggle. By default only the standout sentences are highlighted (top 25%, adjustable); darker means stronger within your document. Density is inverted, so *loose* sentences get the highlight.
- **Argument highlights.** Phrase-by-phrase roles in the PEAR style: Thesis, Point, Evidence, Analysis, Counterargument, Rebuttal, Link. Text that does no argumentative work is never highlighted, and a threshold hides weakly performed roles.
- **Score tab.** Structure checks, role balance against healthy ranges, and tension by paragraph, all computed instantly. **Evaluate with AI** adds rubric scores, an overall grade, and prioritized fixes that jump to the exact sentence.
- **Editing.** Menus, toolbar, fonts, colors, lists, links, find & replace, word count, and autosave in your browser.
- **Export.** PDF, Word (.docx), and print, each with or without the analysis colors.
- **Color packs.** Every pack is capped so black text stays readable.

## Using the website

The example essay opens ready to explore. To analyze **your own writing**, click **Add API key** and paste an [Anthropic](https://console.anthropic.com/settings/keys) or [OpenAI](https://platform.openai.com/api-keys) API key, then pick a model (Claude Opus 5.5 / Sonnet 5.5, GPT-5.5 / GPT-5.4 mini, or any other model id). Both providers get the same prompts and rubric.

- Your key stays in your browser and is sent only to that provider's API (`api.anthropic.com` or `api.openai.com`). The site has no server.
- Usage is billed to your own account: a few short requests per paragraph you edit, plus one larger request each time you run Score → Evaluate.
- **Without a key**, highlights still appear. They come from rough local estimates: sentence length, filler and hedge words, contrast words, cue phrases such as "for example", and paragraph position. They're ranked within your document, so the top ones are always painted. The panel labels them **Estimate**; AI results are labeled **Claude** or **OpenAI**.

## Run locally

```bash
npm install
cp .env.example .env   # optional: Google OAuth + a server-side Anthropic key
npm run dev            # web on :5173, API on :8787
```

Local development can also run with a server. If `.env` has `ANTHROPIC_API_KEY`, the Express server calls Claude and no browser key is needed. The server supports Anthropic only; OpenAI keys work from the browser. If it has `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, sign-in is required. The redirect URI to register with Google is `http://localhost:5173/auth/google/callback`. Without a `.env`, it behaves like the website.

### Baking Claude's analysis into the example

1. Run locally with a key and let Claude analyze the example. Optionally run Score → Evaluate too.
2. Choose **Tools → Save analysis as site example (dev)**.
3. Put the downloaded `sample-analysis.json` in `public/`.

Visitors then see real Claude results on the example without a key.

## Deploying

Every push to `main` builds the static site (`npm run build:pages`) and publishes it to GitHub Pages through `.github/workflows/pages.yml`.

## Layout

| Path | What it does |
| --- | --- |
| `shared/genres.ts` | Genre profiles: axes, roles, rubric, balance ranges, colors, and API types. Add new genres here. |
| `shared/prompts.ts` | Provider-neutral prompts, output schemas, and normalization. |
| `shared/claude.ts` | Anthropic calls, used by the server and the browser. |
| `src/llm/` | Browser key storage for Anthropic and OpenAI, the OpenAI calls, and routing between the server and the browser. |
| `src/analysis/segment.ts` | Splits the document into sentences mapped to editor positions. |
| `src/analysis/heuristics.ts` | Instant local estimates. |
| `src/analysis/highlight.ts` | What to paint (thresholds, palettes), rendered as ProseMirror decorations. |
| `src/analysis/scheduler.ts` | Debounced, incremental, per-paragraph analysis. |
| `src/analysis/evaluate.ts` | Local structure checks, role balance, and tension arc for the Score tab. |
| `src/export/` | Document → styled runs, then the PDF and Word writers. |
| `server/` | Optional local server: Google OAuth and the server-side Claude key. |
