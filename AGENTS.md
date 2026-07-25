# AGENTS.md

Dialogia is a local-first, multi-model chat and tutoring UI. Next.js 15 (App Router), React 18,
TypeScript, Zustand, Tailwind v4, Dexie/IndexedDB. Bun is the package manager and script runner.

## Commands

- `bun install` — install dependencies (packageManager `bun@1.3.2`).
- `bun run dev` — dev server at http://localhost:3000.
- `bun run build` / `bun start` — production build / serve.
- `bun run lint:types` — TypeScript check (`tsc --noEmit`). No emit step; this is the lint.
- `bun run test` — tsx runner over `tests/**/*.test.ts` and `src/**/*.test.ts`. It always runs the
  full suite; passing a file path does not filter. The suite is fast (~3s), run all of it.
- `bun run format` — Prettier (single quotes, semicolons, trailing commas, width 100).
- `scripts/ci.sh` — lint:types + test + format. Run all three before declaring work done.
- `bun run tutor:simulate` — headless tutor pipeline.

## Layout and conventions

- `app/` — routes and API proxies (`app/api/*`). `app/page.tsx` is a **server component** that
  derives `initialIsMobile` from request headers and renders `src/components/HomeClient.tsx`. Do
  not add `'use client'` to it; client logic belongs in HomeClient.
- `src/components/` — PascalCase files, named exports. `src/lib/` — state, services, agent,
  transport. `styles/` — global CSS. Tests live in `tests/` or colocated as `*.test.ts`.
- Path aliases: `@/components/*`, `@/lib/*`, `@/data/*` (see `tsconfig.json`). Always prefer them.
- `camelCase` functions/variables, `SCREAMING_SNAKE_CASE` module-level constants.
- Comments only for constraints the code cannot express; match the sparse existing density.

## Architecture: layers and import boundaries

Read ARCHITECTURE.md before structural work. ESLint enforces layer boundaries
(`no-restricted-imports` in `eslint.config.js`); violating them fails review even if types pass:

- `src/lib/db/**` must not import agent, store, or components.
- `src/lib/agent/**` must not import UI components or `src/lib/services/**`.
- `src/components/**` must not import transport clients (`src/lib/api/*`, `src/lib/openrouter`) or
  server-only modules.

Practical consequence: shared helpers needed by both agent and services belong in a layer both may
import (e.g., user-facing notice text lives in `src/lib/store/notices.ts`, not in services).

## State and persistence (the part most likely to bite)

- Zustand store composed in `src/lib/store/index.ts` from slices. Messages are indexed as
  `messagesById` + `messageIdsByChatId`; always go through `src/lib/messages/indexing.ts` helpers
  rather than touching the maps directly.
- **Message hydration is lazy.** Startup loads only the selected chat's messages; other chats load
  via `ensureChatMessagesLoaded` (selection) or idle prefetch, tracked in `loadedMessageChatIds`
  and `nonEmptyChatIds`. Code needing every message in memory must call
  `ensureAllChatMessagesLoaded` first. Export/import read the DB directly and are unaffected.
- Zustand `persist` stores preferences only (see `buildPersistedState`); chat data lives in
  IndexedDB via the repository in `src/lib/db/repository.ts`.
- **When you add a field to `StoreDataState` or an action to `StoreActions`, update all three
  mirrors or types will fail:** `tests/helpers/createTestStoreState.ts`, the inline `baseState` in
  `tests/updateMessageInChat.test.ts`, and `src/tooling/headless/store.ts`.

## Streaming path

- Token flushes are batched (`src/lib/agent/streaming/accumulator.ts`, ~32ms) and the partial
  assistant message is checkpointed to IndexedDB during the stream (`streamHandlers.ts`). Preserve
  both properties when touching the stream pipeline.
- During streaming, markdown renders through `StreamingMarkdown`, which memoizes completed blocks
  (`src/lib/markdown/blocks.ts`) and re-parses only the tail. Never render the full document per
  flush. The `streaming` prop on `Markdown` gates Prism caching, Mermaid rendering, and image
  zoom; thread it through if you add embedded renderers.

## UI, styling, and motion

- Design language is documented in DESIGN.md ("Imperial Archive" light, "Candlelit Study" dark).
  Tokens in `styles/tokens.css`; use tokens and `color-mix`, never hard-coded hex in components.
- Theme state has a single source of truth: `useThemeMode` (`src/lib/hooks/useThemeMode.ts`).
  Never read or write `localStorage.theme` directly in components.
- Motion: respect the global reduced-motion kill switch in `styles/layout.css` (covers
  pseudo-elements). Framer-motion trees must sit under `MotionConfig reducedMotion="user"`
  (already wrapped in HomeClient/MobileShell). Infinite ambient animations should be pausable via
  the `.tab-hidden` class (`useAmbientMotionPause`). Collapsible panel bodies use the
  `panel-reveal` grid animation, not max-height hacks.
- Desktop side panels collapse via CSS width transitions on `.sidebar-slot` /
  `.right-panel-slot`; do not reintroduce framer `layout` animations on the app shell.

## Testing

- Plain `node:test` + `assert/strict`, executed by tsx. Name files `*.test.ts(x)`.
- No network calls in tests; stub `fetch` (see `tests/helpers/mockFetch.ts`). Pure logic in
  `src/lib/*` is the preferred test surface.
- Good targets: selectors, request builders, stream handling, store mutations.

## Security and configuration

- Prefer proxy mode (`NEXT_PUBLIC_USE_OR_PROXY=true`); provider keys stay server-side in
  `.env.local`. Never commit secrets or expose sensitive values as `NEXT_PUBLIC_*`.
- See CONFIGURATION.md for env vars and the access-gate setup.

## Working agreements

- Make minimal, focused changes; avoid broad renames and drive-by refactors.
- Keep ARCHITECTURE.md in sync when flows change, DESIGN.md when the visual language changes.
- Before requesting review: `bun run lint:types && bun run test && bun run format`.
- Commits: imperative, concise subjects. PRs: description, rationale, screenshots/GIFs for UI.
