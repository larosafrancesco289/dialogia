# AGENTS.md

Dialogia is a local-first, BYOK chat and tutoring SPA. Vite + TanStack Router (no SSR), React 18,
TypeScript, Zustand, Tailwind v4, Dexie/IndexedDB, Bun, Cloudflare Pages.

Read [ARCHITECTURE.md](ARCHITECTURE.md) before structural work and
[CONTRIBUTING.md](CONTRIBUTING.md) for commands, conventions and testing. This file carries only
what neither of those can teach you by being read once — the things that look safe and are not.

## Before you declare done

`scripts/ci.sh` must pass: hygiene, `tsc --noEmit`, the full test suite, Prettier, ESLint.
`bun run test` ignores any path you pass it and always runs everything; it takes a few seconds.

## Invariants

Breaking one of these produces a regression the type checker will not catch.

**Message hydration is lazy.** Startup loads only the selected chat's messages; the rest arrive via
`ensureChatMessagesLoaded` or idle prefetch. Anything needing every message in memory must call
`ensureAllChatMessagesLoaded` first. Export/import read the database directly and are exempt.

**The stream batches flushes and checkpoints.** Tokens coalesce on a ~32 ms cadence
(`agent/streaming/accumulator.ts`), and the partial assistant message is written to IndexedDB as it
grows (`streamHandlers.ts`). Keep both. Never re-render the whole markdown document per flush —
`StreamingMarkdown` memoizes completed blocks and re-parses only the tail.

**Layer boundaries are lint-enforced**, including dynamic and relative imports of `@/modules/*`.
See `eslint.config.js`. A helper both sides need belongs in a layer both may import.

**`AppModule.load` must stay a dynamic import; module panels must stay `React.lazy`.** A static
`load` costs 22 kB in the boot bundle; a static panel import is an initialisation cycle through the
store, not merely a regression.

**Persisted data must survive.** `localStorage['dialogia-ui']`, IndexedDB `dialogia`, and IndexedDB
`dialogia-keys` all belong to real users. No key renames without a migration;
`tests/persistedStoreCompat.test.ts` guards the persisted key set.

**Never emit an ungated field for a user-configured endpoint.** An unlisted capability is never
sent — a strict OpenAI-compatible server rejects the entire request over one unknown key.

**Never add `rehype-raw`.** Model output is untrusted and BYOK keys live in the same origin. The
import is lint-banned with that reason attached.

**Tokens, not hex.** Colours come from `styles/tokens.css` via `color-mix`. Theme state has one
source of truth, `useThemeMode`; never touch `localStorage.theme` from a component.

## Non-obvious mechanics

- The store initializer is composed from the real slices by `buildStoreInitializer()`. Adding a
  field or an action touches one slice file. Do not create a second copy of store state for tests.
- Endpoint _config_ lives in the store; the request path reads `transport/endpointRegistry`, which
  the slice republishes into on every mutation. Read endpoints from the registry — it is what
  carries the deployment's proxy flags.
- Keys are read synchronously from a cache warmed by `loadKeys()`. A key the user pasted beats the
  deployment's proxy.
- `SearchMode` is an open string, and "provider-native search" (a request field) is a different
  mechanism from a `SearchProvider` (a tool call). Do not collapse them.
- Client config is `import.meta.env.VITE_*`, inlined at build time. Server config is read per
  request through `@/lib/env/source`, which the worker binds from the Cloudflare environment.
  `isProd()` is the build mode; `isServerProd()` is the deployment's `NODE_ENV`, and an absent
  value is read as production on purpose.
