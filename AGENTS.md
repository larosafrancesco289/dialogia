# AGENTS.md

Dialogia is a local-first, bring-your-own-key (BYOK) chat and tutoring single-page app. Vite +
TanStack Router (no server-side rendering), React 18, TypeScript, Zustand, Tailwind v4,
Dexie/IndexedDB, Bun, Cloudflare Pages.

Read [ARCHITECTURE.md](ARCHITECTURE.md) before structural work and
[CONTRIBUTING.md](CONTRIBUTING.md) for commands, conventions and testing. This file carries only
what neither of those can teach you by being read once. It lists what looks safe and is not.

## Before you declare done

`scripts/ci.sh` must pass. It runs hygiene, `tsc --noEmit`, the full test suite, Prettier, ESLint
and the `knip` dead-code gate. `bun run test` ignores any path you pass it and always runs
everything.

## Invariants

Breaking one of these produces a regression the type checker will not catch.

**Message hydration is lazy.** Startup loads only the selected chat's messages. The rest arrive via
`ensureChatMessagesLoaded` or idle prefetch. Anything needing every message in memory must call
`ensureAllChatMessagesLoaded` first. Export/import read the database directly and are exempt.

**The stream batches flushes and checkpoints.** Tokens coalesce on a 32 ms cadence
(`flushIntervalMs`, `src/lib/agent/streaming/accumulator.ts`), and the partial assistant message
is written to IndexedDB as it grows (`src/lib/agent/streamHandlers.ts`). Keep both. Never re-render
the whole markdown document per flush. `StreamingMarkdown` memoizes completed blocks and re-parses
only the tail.

**Layer boundaries are lint-enforced**, including dynamic and relative imports of `@/modules/*`.
See `eslint.config.js`. A helper both sides need belongs in a layer both may import.

**`AppModule.load` must stay a dynamic import. Module panels must stay `React.lazy`.** A static
`load` pulls a module's turn half into the boot bundle. A static panel import creates an
initialisation cycle through the store, which is worse.

**Persisted data must survive.** `localStorage['dialogia-ui']`, IndexedDB `dialogia`, and IndexedDB
`dialogia-keys` all belong to real users. No key renames without a migration.
`tests/persistedStoreCompat.test.ts` guards the persisted key set.

**Never emit an ungated field for a user-configured endpoint.** An unlisted capability is never
sent, because a strict OpenAI-compatible server rejects the entire request over one unknown key.

**Never add `rehype-raw`.** Model output is untrusted and BYOK keys live in the same origin. The
import is lint-banned with that reason attached.

**Colours come from tokens.** Use `styles/tokens.css` via `color-mix`, never a hex literal. Theme
state has one source of truth, `useThemeMode`. Never touch `localStorage.theme` from a component.

## Non-obvious mechanics

- The store initializer is composed from the real slices by `buildStoreInitializer()`. Adding a
  field or an action touches one slice file. Do not duplicate store state in tests.
- Endpoint _config_ lives in the store. The request path reads
  `src/lib/transport/endpointRegistry.ts`, which the slice republishes into on every mutation. Read
  endpoints from the registry.
- Keys are read synchronously from a cache warmed by `loadKeys()`. The app never reads a key from
  the environment; only the tutor simulation CLI does, in Node.
- `SearchMode` is an open string, and "provider-native search" (a request field) is a different
  mechanism from a `SearchProvider` (a tool call). Do not collapse them.
- Client config is `import.meta.env.VITE_*`, inlined at build time. There is no server config,
  because there is no server.
