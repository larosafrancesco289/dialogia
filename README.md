### Dialogia

Local-first, privacy-focused multi-model chat UI for OpenRouter.

### Highlights

- Local storage: Chats, messages, folders persisted in-browser via IndexedDB (Dexie).
- ZDR-first: Lists and enforces Zero Data Retention models by default; toggleable.
- Model control: Curated picker, favorites, hide-from-dropdown, and custom IDs.
- Rich I/O: Images (vision), audio input (mp3/wav), PDFs; image generation output supported.
- Reasoning: Optional “thinking” stream for reasoning-capable models with effort control.
- Streaming + metrics: TTFT, token counts, tokens/sec; basic cost estimate when pricing is known.
- Compare drawer: Run one prompt across multiple models; copy, insert to chat, or switch model.
- Web search: Optional Brave Search augmentation for source-grounded answers.

### Screenshots

![Front page](assets/frontpage.png)

![Chat](assets/chat.png)

![Image generation](assets/image-gen.png)

![Model selection](assets/model-selection.png)

![Settings](assets/settings.png)

### Setup

Create `/.env.local`. Recommended proxy mode (keeps keys on the server):

```
# Route OpenRouter via Next.js API with server key
NEXT_PUBLIC_USE_OR_PROXY=true
OPENROUTER_API_KEY=sk-or-v1_your_server_key_here

# Optional: Brave Search (server-side only)
BRAVE_SEARCH_API_KEY=brave_your_key_here

# Optional: default ZDR behavior (true if unset)
# Set to false to list all models by default
NEXT_PUBLIC_OR_ZDR_ONLY_DEFAULT=true
```

Client-side mode (not recommended):

```
NEXT_PUBLIC_OPENROUTER_API_KEY=sk-or-v1_your_client_key_here
```

Install dependencies:

```
npm install
```

### Run

- Dev server: `npm run dev` → http://localhost:3000
- Build: `npm run build`
- Start (prod): `npm start`
- Format: `npm run format`
- Type check: `npm run lint:types`

Wrappers are also available: `scripts/dev.sh`, `scripts/build.sh`, `scripts/start.sh`.

### Usage

- Pick a model in the top header. Favorites and hide actions personalize the list.
- Compose and send with Enter; Shift+Enter inserts a newline.
- Attachments:
  - Images: shown inline when the model supports vision.
  - Audio (mp3/wav): sent as input_audio content to audio-capable models.
  - PDFs: sent as OpenRouter file blocks (parsed downstream; no local OCR).
- Reasoning: toggle effort in the composer for thinking models; view “Thinking” panel per message.
- Web search: toggle the Brave icon to ground the next reply with sources.
- Compare: click the grid icon in the header to run a prompt across multiple models and review metrics.
- Slash commands:
  - `/model <id|name>` — set the model.
  - `/search on|off|toggle` — toggle Brave web search.
  - `/reasoning none|low|medium|high` — set reasoning effort.
  - `/help` — list supported commands.

### Architecture

- Framework: Next.js App Router (React 18)
- State: Zustand with local persistence; Dexie for IndexedDB tables
- API proxy: `/api/openrouter/*` for models/completions; `/api/brave` for web search
- Markdown: `react-markdown` + GFM, Prism, KaTeX, Mermaid
- Styles: Tailwind v4 base + `styles/francesco-bootstrap.css` tokens; `app/globals.css` layout
- Capabilities: Derived from OpenRouter model metadata (vision, audio input, image output, reasoning)
- PDFs: Routed with OpenRouter’s file parser plugin — no local parsing required

Security notes:

- Prefer proxy mode (`NEXT_PUBLIC_USE_OR_PROXY=true`) to keep provider keys server-side.
- Avoid placing secrets in `NEXT_PUBLIC_*` env vars when possible.
- Brave Search runs only server-side and requires `BRAVE_SEARCH_API_KEY`.
- ZDR-only: Model listing and sends default to ZDR-only. Override default with `NEXT_PUBLIC_OR_ZDR_ONLY_DEFAULT=false`.

### Project Structure

```
app/                    # Next.js App Router entry (layout, page, globals)
src/components/         # React components (PascalCase .tsx)
src/components/message/ # Message subcomponents (meta, reasoning, sources)
src/lib/                # Utilities, API client, state slices
src/data/               # Curated models and presets
src/types/              # Type augmentations
public/                 # Static assets served by Next
assets/                 # Screenshots
styles/                 # Global CSS tokens (francesco-bootstrap.css)
scripts/                # Helper scripts (dev/build/start)
```

### Development

- Language: TypeScript + React 18; Next.js App Router
- Formatting: Prettier (`.prettierrc`) — single quotes, semicolons, trailing commas=all, width=100
- Naming: PascalCase components in `src/components/`; named exports favored
- Type safety: run `npm run lint:types` before pushing
- Testing: none configured; validate via UI. If adding tests, prefer colocated `*.test.ts(x)` and discuss framework (Jest+RTL or Playwright).

### License

MIT

