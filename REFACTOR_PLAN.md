# Dialogia — Refactor Plan

This document outlines an ideal refactor of the repository to reach consistently high standards of software quality: simpler modules, clearer boundaries, less duplication, safer defaults, and more predictable state/streaming behavior. It is intentionally action-oriented and does not include code changes.

## Guiding Principles (Target Standards)

- **Single source of truth** for contracts (tool names, schemas, metadata, handlers), configuration, and routing policies.
- **One owner per concern** (e.g., streaming lifecycle, controller management, plan progression), with other layers consuming via narrow interfaces.
- **Immutability by default** in store updates so UI can rely on referential equality and simple memoization.
- **Type-driven design**: remove `any` where it hides invariants; prefer small runtime validators at boundaries (API/tool args) with strong TS types internally.
- **Security & privacy first**: avoid accidental third-party requests from the UI; keep secrets server-only; make proxy boundaries explicit.
- **Documentation is executable**: docs reflect actual file paths, flows, and configuration; tests and scripts match docs.

## Current Strengths (Keep and Build On)

- Clear layering intent (UI → Store → Agent → Services → Transport → API routes) and good modular separation in many areas.
- Solid test suite using `node:test` + `tsx`, covering key subsystems (ZDR, store migrations, headless, planning).
- Thoughtful features already structured as modules: ZDR policy, headless runner, tool-call logging, prompt-builder.

## Major Issues (Highest ROI)

1. **Documentation drift**: `ARCHITECTURE.md` references paths/modules that don’t exist (e.g., `src/lib/orchestrator/*`, `src/lib/zdr/*`, `src/lib/db.ts`).
2. **Inconsistent API route patterns**: mixed timing/error/response pass-through strategies across `app/api/*` (some use `withTiming/jsonError`, some re-implement).
3. **Env/config duplication**: multiple `requireEnv`/env-read implementations across `src/lib/config.ts`, `src/lib/server/route.ts`, and `src/lib/auth/index.ts`.
4. **Tool registry duplication risk**: tutor tool names and metadata are repeated across types, sets, metadata tables, definitions lists, handler maps, and docs.
5. **Streaming lifecycle split-brain**: both services and stream callbacks mutate global streaming flags/controllers, creating multi-model race conditions and “stop streaming” brittleness.
6. **Oversized UI components**: `MessageList`, `MessageCard`, `SettingsDrawer`, `ChatSidebar`, `FolderItem` bundle multiple concerns (state, behavior, accessibility, rendering, performance).
7. **Repeated long-press logic**: custom mobile long-press detection is duplicated (sidebar chats/folders) while other areas use `useLongPressSheet`.
8. **JSON/LLM-output parsing duplication**: multiple “extract JSON from text / parse partial JSON / parse tool args” implementations scattered across lib/agent and lib/learningPlan.
9. **Privacy footguns in UI**: DeepResearch timeline fetches favicons from Google (`www.google.com/s2/favicons`), contradicting “privacy-focused” positioning.
10. **Dependency hygiene**: at least some dependencies appear unused by the codebase (`codex`, `@fal-ai/client`, possibly `ts-node`), increasing install/build surface area.

## Refactor Roadmap (Phased, Safe-by-Default)

### Phase 0 — Repo Hygiene + Doc Alignment (Fast Wins)

- Delete tracked OS/tool artifacts (`.DS_Store`, `.eslintcache`, any accidentally committed build outputs) and ensure `.gitignore` covers them (already mostly present).
- Update `ARCHITECTURE.md` to match the real tree:
  - Replace `src/lib/orchestrator/*` → `src/lib/agent/orchestrator/*`.
  - Replace `src/lib/zdr/*` → `src/lib/policy/zdr/*`.
  - Replace `src/lib/db.ts` references → `src/lib/db/dexie.ts` / `src/lib/db/sanitize.ts` / `src/lib/db/repository.ts`.
- Audit README references to flows and ensure “proxy mode” and “headless tutor” instructions match current behavior.
- Run a dependency audit and remove unused deps (or document why they are present).

### Phase 1 — Server Boundary Cleanup (API Routes + Env)

**Goal:** one consistent “server route” shape and one consistent env reader.

- Introduce a single env utility module (e.g., `src/lib/env/*`) and:
  - Replace `requireEnv` duplicates in `src/lib/server/route.ts` and `src/lib/auth/index.ts`.
  - Fold `src/lib/config.ts` env parsing onto the same primitives (`readString`, `readBool`, `requireString`, etc.).
- Standardize `app/api/*` patterns:
  - Replace ad-hoc timing blocks with `withTiming`.
  - Replace ad-hoc error JSON with `jsonError` (or a typed `jsonProblem` helper).
  - Extract a shared “proxy pass-through” helper for the common pattern:
    - Read request body (text/json)
    - Call client fetcher
    - Forward status/body/content-type with `no-store`
- Align auth middleware constants:
  - Use `AUTH_MIDDLEWARE_MATCHER` in `middleware.ts` instead of duplicating the matcher string.
  - Remove or rationalize entries in `PUBLIC_AUTH_PATHS` that can never be hit due to the matcher excluding `/api/*` (or update the matcher to match the intended behavior).

### Phase 2 — Contracts as Code (Tools, Types, Parsing)

**Goal:** eliminate drift by generating all derived tool artifacts from one registry.

- Create a **single tutor tool registry** (source of truth) that owns:
  - Tool name union/type
  - Tool JSON schema (ToolDefinition)
  - Tool metadata (category/tags/phases/priority)
  - Handler binding (parseArgs/apply)
- Derive the following from the registry (delete duplication):
  - `TutorToolName` union in `src/lib/agent/types.ts` (derive via `keyof`).
  - `TUTOR_TOOL_NAME_SET` in `src/lib/agent/tools/tutor.ts`.
  - `TOOL_METADATA` in `src/lib/agent/tools/metadata.ts`.
  - `getTutorToolDefinitions()` list in `src/lib/agent/tools/definitions/tutorTools.ts`.
  - Update `TUTOR_TOOL_CONTRACT.md` to be generated or at least validated against the registry.
- Consolidate JSON parsing utilities:
  - Extract “JSON from markdown fences”, “parse partial JSON”, and “scan JSON object boundaries” into a single `src/lib/json/*` module.
  - Replace one-off parsers in:
    - `src/lib/agent/tools/json.ts`
    - `src/lib/agent/streaming.ts` (object-end detection)
    - `src/lib/agent/learnerModel.ts` (`parseJSONResponse`)
    - `src/lib/learningPlan/generator.ts` (code-fence JSON extraction)
- Tighten plan update typing:
  - Replace `Message.planUpdates.statusChanges.from/to: string` with the actual `LearningPlanNode['status']` union.
  - Separate “UI narrative summary” from “machine diff” so downstream consumers don’t parse free-form text.

**Illustrative pattern (registry shape):**

```ts
// Pseudocode only (do not copy as-is)
export const tutorToolRegistry = defineRegistry({
  generate_plan: { definition: ..., metadata: ..., handler: ... },
  quiz_mcq: { definition: ..., metadata: ..., handler: ... },
});
export type TutorToolName = keyof typeof tutorToolRegistry;
export const tutorToolDefinitions = Object.values(tutorToolRegistry).map((t) => t.definition);
```

### Phase 3 — Streaming + Turn Lifecycle Consolidation

**Goal:** one owner for “streaming status” and “abort controller lifecycle”, especially for multi-model chat.

- Choose a single authority for `ui.isStreaming`:
  - Either (A) services own it (recommended), or (B) stream callbacks own it; not both.
- Choose a single authority for turn controllers:
  - Fix the current split where `spawnTurnMessages` sets a master controller, while `createMessageStreamCallbacks` clears it on each completion.
  - Model multi-model turns explicitly:
    - Store controllers per `(chatId, modelId)` or a structured “turn group” object instead of a single `Map<chatId, AbortController>`.
    - Ensure “Stop streaming” reliably aborts *all* active streams and is not broken by early clearing.
- Make completion accounting explicit:
  - Let the per-model executor signal completion to a shared coordinator which decides when to clear controllers and set `isStreaming=false`.
  - Remove any direct toggling of `isStreaming` from lower-level callbacks once a coordinator exists.
- Unify DeepResearch streaming with the standard message streaming pipeline:
  - Prefer emitting structured tool call log entries and/or a typed `reasoningTrace` field over storing an opaque JSON string in `Message.reasoning`.
  - If keeping `Message.reasoning` as “string”, introduce a parallel `Message.reasoningFormat: 'text' | 'deepResearchTrace'` to stop heuristic parsing.

### Phase 4 — UI Decomposition + Performance Simplification

**Goal:** reduce component size, eliminate bespoke memo comparators, and remove duplicated interaction logic.

- Split oversized components:
  - Extract “edit state”, “copy/branch/regenerate handlers”, “mobile action sheet”, and “windowing/jump-to-latest” into focused hooks/components from `src/components/MessageList.tsx`.
  - Reduce `src/components/message/MessageCard.tsx` responsibilities by extracting:
    - `AssistantMessageContent` / `UserMessageContent` into separate files.
    - The “fallback final answer from reasoning trace” logic into a shared formatter (or fix upstream so it isn’t needed).
    - Move “panels props flattening” into a `useMessagePanelsProps(messageId)` hook.
- Remove brittle `memo` comparators:
  - Make store updates reliably immutable (new object identity for changed messages).
  - Pass precomputed booleans/values instead of functions into leaf components (e.g., pass `statsExpanded: boolean` instead of `isStatsExpanded(id)`).
- Deduplicate long-press and action-sheet behavior:
  - Replace custom long-press code in `ChatSidebar`/`FolderItem` with a single reusable hook (extend `useLongPressSheet` to support “press slop” + “tap suppression”).
  - Centralize mobile sheet rendering primitives (overlay, handle, keyboard escape) into one component.
- Fix privacy leak in DeepResearch timeline:
  - Remove Google favicon fetching or proxy it through your own server route.
  - Default to no third-party requests from message rendering.

### Phase 5 — Styling and Design System Rationalization

**Goal:** fewer global classes, clearer ownership of styles, predictable theming.

- Decide the “primary styling primitive”:
  - Either rely on Tailwind utilities + tokens, or keep a small set of “bootstrap-like” utilities; avoid maintaining both.
- Decompose `app/globals.css`:
  - Extract feature-level sections into `styles/*` (e.g., message panels, mobile sheets, composer).
  - Keep globals limited to tokens, base element styles, and layout primitives.
- Reduce bespoke class strings in components:
  - Extract className builders into small helpers where repeated (cards, overlays, buttons).

### Phase 6 — Scripts, Eval, and Research Artifacts

**Goal:** isolate production app code from evaluation and thesis artifacts.

- Move evaluation-only library code (`src/lib/eval/*`) behind an explicit boundary:
  - Option A: move to `scripts/lib/*`
  - Option B: keep under `src/lib/eval` but add a clear “not shipped to client” guard and document usage.
- Ensure `tmp/` and `thesis/` are not part of runtime builds:
  - Keep them out of the Next.js build graph and confirm they are not referenced from `app/` or client code.
- Add a “scripts contract” doc:
  - Document required env vars and output formats for `tutor-sim`/`ablation` to reduce tribal knowledge.

## Module-by-Module Refactor Actions

### `app/` (App Router)

- Extract app-shell layout concerns from `app/page.tsx` into a dedicated `src/components/AppShell.tsx` (keep `app/page.tsx` as minimal route glue).
- Consolidate dynamic import “warm-up” behavior into a shared hook (e.g., `usePrefetchOnIdle`).

### `app/api/*` (Server Routes / Proxies)

- Replace route-by-route bespoke timing and error handling with a single helper pattern.
- Standardize request parsing:
  - Always treat request bodies as `text()` for pass-through proxies unless you truly need JSON inspection.
  - Avoid “parse JSON to detect stream” in routes; callers can specify stream via endpoint choice.
- Ensure every proxy response sets:
  - `Cache-Control: no-store`
  - correct `Content-Type`
  - consistent `Server-Timing` naming (e.g., `proxy;dur=...` plus route name)

### `src/lib/server/*`

- Expand `src/lib/server/route.ts` into a small toolkit:
  - `withTiming()`, `jsonError()`, `requireEnv()`, plus `proxyPassThrough(res)` and `readJsonSafe(req)`.
- Add a single “problem response” format and use it consistently across all API routes.

### `src/lib/config.ts` + `src/lib/auth/*`

- Replace ad-hoc `requireEnv` variants with shared env helpers.
- Unify `isProd()`/`isDev()` logic and prevent server-only env reads from being imported into client bundles unintentionally.
- Align middleware constants usage (`AUTH_MIDDLEWARE_MATCHER`) and remove dead code paths.

### `src/lib/api/*` + `src/lib/openrouter.ts` + `src/lib/anthropic.ts`

- Split transport wrappers into cohesive modules:
  - `openrouter/modelsCache`, `openrouter/zdr`, `openrouter/chat`, `openrouter/stream`.
  - `anthropic/convert`, `anthropic/chat`, `anthropic/stream`, `anthropic/models`.
- Centralize provider-agnostic error mapping (401/403/429) into `src/lib/api/errors.ts` helpers to avoid repeating status checks in each transport.
- Standardize origin/header logic so it is not re-implemented per provider.

### `src/lib/agent/*` (Composition, Planning, Tools, Streaming)

- Decompose `composeTurn` into pure functions:
  - `computeTutorEnabled(ui, chat)`
  - `computePlugins(prior, attachments, policy)`
  - `computeTools(phase, policy)`
  - `computePreambles(profile, planContext, flags)`
- Simplify `planTurn`:
  - Extract learner model auto-update into a single “pre-plan” step module.
  - Move tool scheduling policies (`QUIZ_TOOL_NAMES`, max tools) into tool metadata/registry so policy is declarative.
- Make tool execution fully boundary-typed:
  - Validate tool args per schema; treat invalid args as tool errors with logged diagnostics.
  - Ensure tool-call logging uses the same structure for search vs tutor tools (same fields, same metadata keys).

### `src/lib/services/*`

- Consolidate turn lifecycle:
  - Ensure the “turn coordinator” is the only place that mutates `ui.isStreaming` and controller ownership.
- Factor `services/turns.ts` further:
  - Extract “DeepResearch auto-activation policy” into a dedicated policy module.
  - Extract “rename New Chat on first user message” into a `ChatService` method or a dedicated helper.

### `src/lib/store/*`

- Remove ad-hoc message scanning patterns:
  - Extract helpers to find messages by id without repeated `for (const [cid, list])` loops.
- Strengthen store typing:
  - Prefer narrowly typed patches over `as any` inside `set()` lambdas.
- Ensure persisted vs ephemeral state is explicit:
  - Consider moving “ephemeral UI-only” maps (debug, search, tutor attempts) into a dedicated subtree that is never accidentally persisted.

### `src/components/*`

- Introduce feature folders for large verticals:
  - `src/components/chat/*` (pane, composer, list)
  - `src/components/sidebar/*` (folders, items, move sheet)
  - `src/components/message/*` (card, panels, tutor widgets)
  - `src/components/settings/*` already exists—continue pushing logic into panels.
- Replace duplicated mobile sheet UI with a shared `BottomSheet` primitive component.
- Add privacy review to rendering components:
  - No external network requests in message render paths by default.

## Test & Tooling Improvements

- Add contract tests for the tutor tool registry:
  - Assert: all tool names are unique, all have definitions, all have metadata, all have handlers, and docs match.
- Add tests for multi-model streaming coordination:
  - Assert: `stopStreaming()` aborts all active streams and leaves consistent state.
- Add tests for JSON parsing utilities once consolidated:
  - “JSON fence extraction”, “partial JSON repair”, “object boundary scan”.
- Simplify ESLint configuration:
  - Prefer a single config style (flat config) and delete legacy `.eslintrc.json` once fully migrated.

## Definition of Done (Refactor Completion Criteria)

- No duplicated tool-name lists (single registry is authoritative).
- All API routes follow one wrapper convention (timing/errors/caching headers).
- Streaming lifecycle is deterministic for single-model and multi-model turns; “stop streaming” always works.
- Largest UI files are reduced substantially (target: <300 lines each) with extracted hooks/components.
- Documentation references only real paths; docs match runtime behavior.
- `bun run lint:types` and `bun run test` pass; tests cover new boundaries (registry + streaming coordinator).

