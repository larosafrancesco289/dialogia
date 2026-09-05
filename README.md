# Dialogia

A local-first chat and tutoring workspace for whatever models you already pay for. Your keys stay in
your browser, and so do your conversations. The whole thing is a static site you can host anywhere,
and it will run entirely against a model on your own machine if you want it to.

![Front page](assets/frontpage.png)

## What it does

- **Bring your own key (BYOK).** Paste an OpenRouter or Anthropic key and start chatting. The key is
  stored in this browser's IndexedDB and is never included in an export.
- **Or bring your own server.** Point it at Ollama, LM Studio, llama.cpp or vLLM and never talk to
  a hosted provider at all.
- **Everything stays local.** Chats, messages and folders live in IndexedDB. There is no account,
  no sync, and no server at all.
- **Tutor mode.** An optional structured-learning mode. It generates a plan, tracks mastery, and
  runs diagnostics that adapt as you go.
- **Real model control.** A curated picker with favourites, per-model capability flags, reasoning
  effort per turn, provider routing preference, and optional Zero-Data-Retention (ZDR) enforcement.
- **Rich input and output.** Images, audio, and PDFs go in. Markdown with syntax highlighting, KaTeX
  and Mermaid comes out.
- **Grounded answers.** Provider-native web search with any model key, or tool-based search through
  your own Tavily key.
- **Streaming with the numbers.** Time to first token, tokens/sec, token counts, and
  provider-reported cost.

![Chat](assets/chat.png)

## Quickstart with your own key

```bash
bun install
bun run dev
```

Open http://localhost:3000. The setup sheet appears. Pick OpenRouter or Anthropic, paste a key, and
send a message. That is the whole setup. There is no `.env` file to write and no build flags to set.

Get a key from [openrouter.ai/keys](https://openrouter.ai/keys) (one key, most models) or
[console.anthropic.com](https://console.anthropic.com) (Claude, direct).

## Quickstart with a local model

With [Ollama](https://ollama.com) already running, do this.

```bash
ollama pull qwen3:8b
bun run dev
```

In the setup sheet choose **Local**, name it, and give it `http://localhost:11434/v1`. Then in
**Settings › Providers** add the model ids you want and turn on the capabilities your server
actually supports.

Capabilities start off and stay off until you enable them. A strict OpenAI-compatible server rejects
an entire request over one field it does not recognise, so Dialogia sends the minimal body until you
say otherwise. You do not have to guess: **Test connection** in the endpoint's settings sends a few
one-token requests, reports which fields the server accepted, and can set the checkboxes from the
answer. If tool calls or search are unavailable you get a visible notice rather than silence.

![Model selection](assets/model-selection.png)

## Deploying your own

```bash
bun run build
```

`dist/` is a plain static site with no server behind it and no keys anywhere near it. Deploy it to
Cloudflare Pages, Netlify, GitHub Pages, or your own nginx. Dialogia is a single-page app (SPA), so
a host has to serve `index.html` for unknown paths. `public/_redirects` sets that up on hosts that
read it. Anywhere else, point unknown paths at `index.html` yourself.

Every visitor supplies their own key. The first visit opens the setup sheet, which explains where to
get one and stores it in that browser only. A deployment therefore pays for nothing and can be
shared with anyone by link. On Cloudflare Pages the whole setup is build command `bun run build`,
output directory `dist`, and no environment variables.

## Configuration

Nothing is required. The variables below change client defaults, must start with `VITE_`, and are
**inlined into the bundle at build time**, so none of them may hold a secret. `.env.example` is the
authoritative list, and `.env.local` is where your copy goes.

| Variable                           | Default    | Effect                                                                     |
| ---------------------------------- | ---------- | -------------------------------------------------------------------------- |
| `VITE_OR_ZDR_ONLY_DEFAULT`         | `false`    | New sessions start with ZDR-only enforcement.                              |
| `VITE_OR_ROUTE_PREFERENCE_DEFAULT` | `balanced` | `balanced` \| `speed` \| `cost`. Only the latter two send `provider.sort`. |
| `VITE_APP_BASE_URL`                | none       | Absolute origin, sent to OpenRouter as the `HTTP-Referer` courtesy header. |
| `VITE_LOG_LEVEL`                   | none       | Client log verbosity.                                                      |

There is deliberately **no provider key variable**, client-side or otherwise. Keys are pasted into
the app and live in the browser that pasted them.

![Settings](assets/settings.png)

## Using it

- Pick a model in the header. Favourite or hide models to shape the list.
- Enter sends, Shift+Enter adds a newline.
- Attach images (vision models), audio (mp3/wav), or PDFs. PDF text is extracted client-side and
  sent as text, and small files can optionally be sent as file blocks.
- Toggle reasoning effort in the composer for thinking models. Expand the Thinking panel per
  message.
- Toggle web search in the composer. With a search-provider key stored, the same control becomes a
  picker between provider-native and tool-based search.
- The slash commands are `/model <id|name>`, `/search on|off|toggle`,
  `/reasoning none|low|medium|high` and `/help`.

![Image generation](assets/image-gen.png)

### Tutor mode

Turn on **Tutor** in the header, then state a goal such as "I want to learn Python basics" or "teach
me linear algebra fundamentals". The tutor generates a structured plan with prerequisites and
objectives, tracks confidence per topic from what you actually demonstrate in conversation, and
advances when you have shown mastery. Progress shows in the header and in the plan panel. You can
edit the plan or move between topics yourself.

It works best on focused, skill-shaped goals and needs a reasonably capable model. Mastery is
inferred from conversation rather than from formal assessment.

Tutor mode is a self-contained module under `src/modules/tutor`. A fork that does not want it can
delete that directory and its entry in `src/lib/modules.ts`, and the rest of the app compiles and
runs unchanged.

## Development

```bash
bun install
bun run dev          # http://localhost:3000
bun run build        # static build into dist/
bun start            # preview a production build
scripts/ci.sh        # hygiene + types + tests + format + lint
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for conventions and [ARCHITECTURE.md](ARCHITECTURE.md) for
how the app is put together.

Built with Vite, TanStack Router, React 18, Zustand, Dexie and Tailwind v4. Bun is the package
manager and script runner.

## License

MIT. See [LICENSE](LICENSE).
