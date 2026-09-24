# Contributing

Thanks for looking. Dialogia is a small codebase with a few load-bearing rules, and this page is the
short version of them.

## Getting set up

```bash
bun install     # packageManager is bun@1.3.2
bun run dev     # http://localhost:3000
```

No configuration is needed. The app opens its setup sheet, you paste a provider key or point it at
a local server, and you are running. See [README.md](README.md) for the optional build-time
defaults.

## Commands

| Command              | What it does                                                            |
| -------------------- | ----------------------------------------------------------------------- |
| `bun run dev`        | Vite dev server.                                                        |
| `bun run build`      | Static bring-your-own-key (BYOK) build into `dist/`.                    |
| `bun start`          | Preview a production build.                                             |
| `bun run lint:types` | `tsc --noEmit`. There is no emit step, so this is the whole type check. |
| `bun run test`       | Node's test runner over `tests/**/*.test.ts` and `src/**/*.test.ts`.    |
| `bun run lint`       | ESLint, including the layer boundaries.                                 |
| `bun run format`     | Prettier.                                                               |
| `bun run knip`       | Dead-code gate. A file or dependency with no importers fails it.        |
| `scripts/ci.sh`      | All of the above, in the order CI runs them.                            |

**`bun run test` always runs the whole suite.** Passing a file path does not filter it. The suite
takes a few seconds, so run all of it.

Run `scripts/ci.sh` before asking for review. It must be green.

### A note on `bun start`

`vite preview` shares the dev origin, so previewing a production build registers the progressive web
app (PWA) service worker on `localhost:3000`, and later `bun run dev` visits get served the stale
precached shell. The dev server ships a self-destroying `/sw.js` to recover from this. If the app
behaves like it is running someone else's build, that is why.

## Conventions

- **Path aliases always.** Use `@/components/*`, `@/lib/*`, `@/modules/*` and `@/data/*`. Never a
  long relative climb.
- `src/components/` is PascalCase files with named exports. `camelCase` for functions and
  variables, `SCREAMING_SNAKE_CASE` for module-level constants.
- Prettier settings are single quotes, semicolons, trailing commas, width 100.
- **Comments only for constraints the code cannot express.** Match the sparse density already
  there, and do not narrate what the next line does.
- Many `src/lib` modules open with a two-line `// Module:` / `// Responsibility:` header. Keep one
  accurate when you change what that file is for, and add one when a new module's purpose is not
  obvious from its name.
- Make focused changes. No drive-by refactors and no broad renames. Note the opportunity instead.

## Boundaries you cannot cross

ESLint enforces the layer graph, and a violation fails review even when types pass. The rules live
in `eslint.config.js`, and [ARCHITECTURE.md](ARCHITECTURE.md) explains why each exists. Here is the
short list.

- `src/lib/db/**` must not import agent, store or components.
- `src/lib/agent/**` must not import UI components or `src/lib/services/**`.
- `src/lib/transport/**` and the provider clients must not import `src/lib/agent/**`.
- `src/components/**` must not import transport clients, server-only modules, or `rehype-raw`.
- Nothing outside `src/lib/modules.ts` may import `@/modules/*`, whether statically, dynamically, or
  through a relative path. All three are checked.

If a helper is needed on both sides of a boundary, it belongs in a layer both may import.

## Things that will bite you

These are not style preferences. Breaking one of them causes a real regression that tests may not
catch on their own.

- **Message hydration is lazy.** Startup loads only the selected chat's messages. Code that needs
  every message in memory must call `ensureAllChatMessagesLoaded` first.
- **Token flushes are batched** (32 ms, the `flushIntervalMs` constant in
  `src/lib/agent/streaming/accumulator.ts`) and **the partial assistant message is checkpointed to
  IndexedDB during the stream.** Preserve both when touching the stream pipeline.
- **Never re-render the full markdown document per flush.** `StreamingMarkdown` memoizes completed
  blocks and re-parses only the tail.
- **`AppModule.load` must stay a dynamic import** and **module panels must stay `React.lazy`.** The
  first keeps a module's turn half out of the boot bundle. The second avoids an initialisation cycle
  through the store.
- **Persisted key names are a compatibility surface.** Users' `localStorage` and IndexedDB must
  survive every change. Rename nothing without a migration, and keep
  `tests/persistedStoreCompat.test.ts` passing.
- **Never emit an ungated field for a user-configured endpoint.** A strict OpenAI-compatible server
  rejects the whole request over one unknown key.
- **Never introduce `rehype-raw`.** Model output is untrusted and a user's own provider keys live in
  the same origin.

## Testing

Plain `node:test` with `assert/strict`, run through `tsx`. Files are named `*.test.ts(x)` and live
either in `tests/` or beside the code they cover.

- **No network in tests.** Stub `fetch` with `tests/helpers/mockFetch.ts`.
- Build store state from `buildStoreInitializer()` rather than hand-writing a state literal. There
  are no mirrors to maintain and there should not be new ones.
- Pure logic in `src/lib/**` is the preferred surface. That means selectors, request builders,
  stream handling, store mutations and capability gating.
- A bug fix should land with a test that fails without it.

## Simulating tutoring sessions

`bun run tutor:simulate` is the tutor's automated QA harness. It runs one session through the
app's own store, engine and agent loop in Node, with the in-memory database, and an LLM playing a
student from one of the paper's four scenarios (`--list`). The student answers cards the way the
UI does, with learner commands followed by the UI's short message, so the whole protocol is
exercised. It needs `OPENROUTER_API_KEY` in the environment, `.env.local` or `--env-file`, and a
short run costs well under a cent.

```bash
bun run tutor:simulate -- --scenario linear_equations --turns 6 --check
bun run tutor:simulate -- --scenario bayes_rule --plan-editable=false --learner-edits
bun run tutor:simulate -- --help
```

Each run writes a JSON transcript (every exchange, tool call, request, learner action, the final
event log and folded state) and a readable report to `tmp/tutor-sim/`. `--check` exits 1 when a
protocol health check fails: a tool error the tutor never fixed, a card the learner could not
answer, evidence recorded twice for one answer, a reply that gained on a topic it noted a
misconception on, mastery outside [0, 1], an answer key in replayed history, a request without the
state block, or no approved plan or completed topic in time. The harness itself is covered by
`src/modules/tutor/tooling/simulation.test.ts`, with scripted models and no network.

## Pull requests

- Imperative, concise commit subjects. Explain _why_ in the body when it is not obvious.
- Describe the change and the reasoning. Screenshots or a short GIF for anything visual.
- Keep [ARCHITECTURE.md](ARCHITECTURE.md) in sync when a flow changes. For visual work, colours
  come from `styles/tokens.css` via `color-mix`, and that CSS is the design's source of truth.

## Releasing

`main` is where work happens and is never deployed directly. `release` is a pointer to what is live
on dialogia.dev: `.github/workflows/release.yml` runs the checks, builds, and deploys the Worker on
every push to it, using the `CLOUDFLARE_API_TOKEN` repository secret. Ship by fast-forwarding
`release` to `main` once the changes queued there are worth a deploy.

```bash
git log --oneline release..main   # what is queued
git push origin main:release      # ship it
```

Never commit to `release` directly and never let it diverge from `main`. If a push is refused as a
non-fast-forward, `release` has drifted, and the fix is to reconcile it with `main`, not to force it.

## Removing the tutor

Tutor mode is a module, and that is meant to stay true. Deleting `src/modules/tutor` plus its entry
in `src/lib/modules.ts` should leave a compiling, building, working chat app. The only remaining
errors should be in tests that assert tutor behaviour, which a fork would delete too. If a change
makes that false, it has broken something worth fixing.
