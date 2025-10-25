### Dialogia

Local-first, privacy-focused multi-model chat UI for OpenRouter, Anthropic, and beyond.

### Highlights

- Local storage: Chats, messages, folders persisted in-browser via IndexedDB (Dexie).
- ZDR-ready: Optional Zero Data Retention filtering and enforcement; toggleable.
- Model control: Curated picker, favorites, hide-from-dropdown, custom IDs, and provider labels.
- Rich I/O: Images (vision), audio input (mp3/wav), PDFs; image generation output supported.
- Reasoning: Optional “thinking” stream for reasoning-capable models with effort control.
- Streaming + metrics: TTFT, token counts, tokens/sec; basic cost estimate when pricing is known.
- Compare drawer: Run one prompt across multiple models; copy, insert to chat, or switch model.
- Web search: Optional Brave Search or OpenRouter web plugin augmentation for grounded answers.

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

# Optional: default ZDR behavior (false if unset)
# Uncomment to start in ZDR-only mode
# NEXT_PUBLIC_OR_ZDR_ONLY_DEFAULT=true

# Optional: default OpenRouter route preference (speed|cost; defaults to speed)
# NEXT_PUBLIC_OR_ROUTE_PREFERENCE_DEFAULT=cost

# Optional: direct Anthropic access (pick one)
# Direct client key (not recommended for production)
# NEXT_PUBLIC_ANTHROPIC_API_KEY=sk-ant-live_your_client_key_here

# Or proxy via Next.js API with a server key
# NEXT_PUBLIC_USE_ANTHROPIC_PROXY=true
# ANTHROPIC_API_KEY=sk-ant-live_your_server_key_here
```

Private access gate (optional but recommended when sharing preview):

```
# Signed cookie for access sessions
AUTH_COOKIE_SECRET=replace-with-strong-random-hex

# HMAC pepper for access codes
ACCESS_CODE_PEPPER=replace-with-strong-random-hex

# Comma-separated HMAC-SHA256(code, ACCESS_CODE_PEPPER) hex digests
ACCESS_CODES_HASHED=
```

Client-side mode (not recommended):

```
NEXT_PUBLIC_OPENROUTER_API_KEY=sk-or-v1_your_client_key_here
# NEXT_PUBLIC_ANTHROPIC_API_KEY=sk-ant_your_client_key_here
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
- Lint: `npm run lint`
- Type check: `npm run lint:types`
- Tests: `npm run test`

Wrappers are also available: `scripts/dev.sh`, `scripts/build.sh`, `scripts/start.sh`.

### Usage

- Pick a model in the top header. Favorites and hide actions personalize the list.
- Compose and send with Enter; Shift+Enter inserts a newline.
- Attachments:
  - Images: shown inline when the model supports vision.
  - Audio (mp3/wav): sent as input_audio content to audio-capable models.
  - PDFs: sent as OpenRouter file blocks (parsed downstream; no local OCR).
- Reasoning: toggle effort in the composer for thinking models; view “Thinking” panel per message.
- Web search: toggle the search icon to ground the next reply with sources. Brave runs locally when enabled; otherwise the OpenRouter web plugin is attached.
- DeepResearch UI: click the beaker icon in the composer to run multi-step web research on the current input. Results appear as an assistant message with a sources panel.
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
- Agent services: `src/lib/agent/request.ts`, `searchFlow.ts`, and `tutorFlow.ts` centralize request building, web search orchestration, and tutor memory composition for slices.
- Capabilities: Derived from OpenRouter model metadata (vision, audio input, image output, reasoning)
- PDFs: Routed with OpenRouter’s file parser plugin — no local parsing required

Security notes:

- Prefer proxy mode (`NEXT_PUBLIC_USE_OR_PROXY=true`) to keep provider keys server-side.
- Avoid placing secrets in `NEXT_PUBLIC_*` env vars when possible.
- Brave Search runs only server-side and requires `BRAVE_SEARCH_API_KEY`.
- ZDR-only: Opt-in via Settings or `NEXT_PUBLIC_OR_ZDR_ONLY_DEFAULT=true`.
- Access gate: Middleware validates a signed, HttpOnly cookie on every request; unauthenticated users are redirected to `/access`. Add env vars above and distribute plaintext codes privately.

### Deploying on Vercel

- Create a release branch (e.g., `release`) and point your Vercel project’s Production Branch to it.
- Add the env vars from Setup to the Vercel project (Production). Redeploy.
- No client-side keys required; all model calls run through `/api/openrouter/*` with the server-side key.

### Project Structure

```
app/                    # Next.js App Router entry (layout, page, globals)
src/components/         # React components (PascalCase .tsx)
src/components/message/ # Message subcomponents (meta, reasoning, sources)
src/components/settings/# Settings drawer panels per tab (models/chat/tutor/etc.)
src/lib/                # Utilities, API client, state slices
src/data/               # Curated model metadata
src/types/              # Type augmentations
public/                 # Static assets served by Next
assets/                 # Screenshots
styles/                 # Global CSS tokens (francesco-bootstrap.css)
scripts/                # Helper scripts (dev/build/start)
tests/                  # Legacy Node-based unit tests (`npm run test` also runs colocated *.test.ts)
```

### Development

- Language: TypeScript + React 18; Next.js App Router
- Formatting: Prettier (`.prettierrc`) — single quotes, semicolons, trailing commas=all, width=100
- Naming: PascalCase components in `src/components/`; named exports favored
- Linting & types: run `npm run lint` and `npm run lint:types` before pushing
- Testing: `npm run test` (Node test runner via `tsx`); add colocated `*.test.ts(x)` for unit coverage.

### License

MIT
