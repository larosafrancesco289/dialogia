# Contributing

Thanks for looking. Dialogia is a small codebase with a few load-bearing rules; this page is the
short version of them.

## Getting set up

```bash
bun install     # packageManager is bun@1.3.2
bun run dev     # http://localhost:3000
```

No configuration is needed. The app opens its setup sheet, you paste a provider key or point it at
a local server, and you are running. See [README.md](README.md) for the environment variables the
hosted variant uses.

## Commands

| Command                | What it does                                                               |
| ---------------------- | -------------------------------------------------------------------------- |
| `bun run dev`          | Vite dev server. Also mounts the worker's API routes, so proxy mode works. |
| `bun run build`        | Static BYOK build into `dist/`.                                            |
| `bun run build:hosted` | The same, plus `dist/_worker.js`.                                          |
| `bun start`            | Preview a production build.                                                |
| `bun run lint:types`   | `tsc --noEmit`. There is no emit step; this is the type check.             |
| `bun run test`         | Node's test runner over `tests/**/*.test.ts` and `src/**/*.test.ts`.       |
| `bun run lint`         | ESLint, including the layer boundaries.                                    |
| `bun run format`       | Prettier.                                                                  |
| `scripts/ci.sh`        | All of the above, in the order CI runs them.                               |

**`bun run test` always runs the whole suite** — passing a file path does not filter it. The suite
takes a few seconds; run all of it.

Run `scripts/ci.sh` before asking for review. It must be green.

### A note on `bun start`

`vite preview` shares the dev origin, so previewing a production build registers the PWA service
worker on `localhost:3000` and later `bun run dev` visits get served the stale precached shell. The
dev server ships a self-destroying `/sw.js` to recover from this, but if the app behaves like it is
running someone else's build, that is why.

## Conventions

- **Path aliases always**: `@/components/*`, `@/lib/*`, `@/modules/*`, `@/data/*`. Never a long
  relative climb.
- `src/components/` is PascalCase files with named exports. `camelCase` for functions and
  variables, `SCREAMING_SNAKE_CASE` for module-level constants.
- Prettier: single quotes, semicolons, trailing commas, width 100.
- **Comments only for constraints the code cannot express.** Match the sparse density already
  there; do not narrate what the next line does.
- Many `src/lib` modules open with a two-line `// Module:` / `// Responsibility:` header. Keep one
  accurate when you change what that file is for, and add one when a new module's purpose is not
  obvious from its name.
- Make focused changes. No drive-by refactors, no broad renames — note the opportunity instead.

## Boundaries you cannot cross

ESLint enforces the layer graph, and a violation fails review even when types pass. The rules live
in `eslint.config.js`; [ARCHITECTURE.md](ARCHITECTURE.md) explains why each exists. The short list:

- `src/lib/db/**` must not import agent, store or components.
- `src/lib/agent/**` must not import UI components or `src/lib/services/**`.
- `src/lib/transport/**` and the provider clients must not import `src/lib/agent/**`.
- `src/components/**` must not import transport clients, server-only modules, or `rehype-raw`.
- Nothing outside `src/lib/modules.ts` may import `@/modules/*` — statically, dynamically, or
  through a relative path. All three are checked.

If a helper is needed on both sides of a boundary, it belongs in a layer both may import.

## Things that will bite you

These are not style preferences. Breaking one of them causes a real regression that tests may not
catch on their own.

- **Message hydration is lazy.** Startup loads only the selected chat's messages. Code that needs
  every message in memory must call `ensureAllChatMessagesLoaded` first.
- **Token flushes are batched** (~32 ms) and **the partial assistant message is checkpointed to
  IndexedDB during the stream.** Preserve both when touching the stream pipeline.
- **Never re-render the full markdown document per flush.** `StreamingMarkdown` memoizes completed
  blocks and re-parses only the tail.
- **`AppModule.load` must stay a dynamic import** and **module panels must stay `React.lazy`.** The
  first keeps a module's turn half out of the boot bundle; the second avoids an initialisation
  cycle through the store.
- **Persisted key names are a compatibility surface.** Users' `localStorage` and IndexedDB must
  survive every change. Rename nothing without a migration, and keep
  `tests/persistedStoreCompat.test.ts` passing.
- **Never emit an ungated field for a user-configured endpoint.** A strict OpenAI-compatible server
  rejects the whole request over one unknown key.
- **Never introduce `rehype-raw`.** Model output is untrusted and BYOK keys live in the same
  origin.

## Testing

Plain `node:test` with `assert/strict`, run through `tsx`. Files are named `*.test.ts(x)` and live
either in `tests/` or beside the code they cover.

- **No network in tests.** Stub `fetch` with `tests/helpers/mockFetch.ts`.
- Build store state from `buildStoreInitializer()` rather than hand-writing a state literal. There
  are no mirrors to maintain and there should not be new ones.
- Pure logic in `src/lib/**` is the preferred surface: selectors, request builders, stream handling,
  store mutations, capability gating.
- A bug fix should land with a test that fails without it.

## Pull requests

- Imperative, concise commit subjects. Explain _why_ in the body when it is not obvious.
- Describe the change and the reasoning. Screenshots or a short GIF for anything visual.
- Keep [ARCHITECTURE.md](ARCHITECTURE.md) in sync when a flow changes, and
  [DESIGN.md](DESIGN.md) when the visual language does.

## Removing the tutor

Tutor mode is a module, and that is meant to stay true. Deleting `src/modules/tutor` plus its entry
in `src/lib/modules.ts` should leave a compiling, building, working chat app — the only remaining
errors being in tests that assert tutor behaviour, which a fork would delete too. If a change makes
that false, it has broken something worth fixing.
