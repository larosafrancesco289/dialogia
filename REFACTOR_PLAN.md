# Refactor Plan — Dialogia

A staged, surgical refactor to improve simplicity, readability, modularity, naming consistency, and testability without changing user‑facing behavior.

## Goals

- Reduce complexity by decomposing large modules into focused units.
- Remove duplication and centralize shared logic and constants.
- Tighten boundaries between UI state, domain logic, and IO (API/LLM).
- Improve naming, documentation, and tests for critical utilities.
- Keep proxies and secrets server-side while clarifying configuration.

---

## High‑Risk/High‑Value Targets (Summary)

- Break up `src/lib/store/messageSlice.ts` into smaller domain modules; keep the slice thin.
- Extract Brave/OpenRouter web search tooling into a shared service.
- Extract Tutor hidden-context builders and memory update helpers.
- Consolidate request payload/debug building and plugin assembly in one place.
- Split `SettingsDrawer` into tab panels; move gesture logic from `app/page.tsx` into a hook.
- Remove unused modules (`src/lib/env.ts`, `src/lib/pdfRag.ts` if not reintroduced, unused hooks/crypto) and dead code.
- Add deterministic tests for core utilities (models, cost, html, tools, tutor memory, ZDR filters).

---

## Architecture & Boundaries

- Separate concerns explicitly:
  - Extract IO/services from state slices: Add `src/lib/services/` for OpenRouter calls composition, Brave search, and planning flows. Keep slices responsible for state updates only.
  - Extract Tutor flows into `src/lib/agent/tutorFlow.ts` (welcome, memory advance, hidden-context composition, quiz/tool merges).
  - Extract Search flows into `src/lib/agent/searchFlow.ts` (tool schema, OR plugin choice, Brave API routing, results merging, sources block assembly).
  - Extract request build helpers into `src/lib/agent/request.ts` (provider sort, tools array, PDF plugins, debug payloads).

- Introduce minimal “ports and adapters” shape:
  - Define small interfaces where useful (e.g., `MessagePersister`, `SearchClient`) to ease testing.
  - Keep `src/lib/openrouter.ts` low-level; compose higher-level behavior in services.

- Document module responsibilities in short headers at the top of new files.

Actions

- Create `src/lib/agent/request.ts`; move request/stream/debug/preamble assembly helpers here.
- Create `src/lib/agent/searchFlow.ts`; move Brave/OR search tooling logic here.
- Create `src/lib/agent/tutorFlow.ts`; move tutor preamble, hidden content, memory update orchestration here (use existing primitives).
- Convert `messageSlice.ts` to call the above modules; remove duplicate inline logic.

---

## Zustand Store Slices

Current issues

- `messageSlice.ts` is very large and mixes IO, state, planning, search, tutor, and persistence.
- Tutor hidden content building is duplicated across `chatSlice.ts` and `messageSlice.ts`.
- Provider sorting and plugin assembly duplicated across slices (`messageSlice`, `compareSlice`).

Actions

- Keep slices thin:
  - Move heavy logic into service modules; expose small functions that return state patches or side effects to apply.
  - Keep IO (fetch/stream) in services; pass callbacks to update state via injected functions.
- Extract shared helpers:
  - Extract `buildHiddenTutorContent(tutorPayload) => string` used wherever hidden content is set.
  - Extract `getProviderSort(ui.routePreference) => 'price'|'throughput'`.
  - Extract `buildPlugins({ hasPdf, searchProvider, searchEnabled })`.
  - Extract `snapshotGenSettings(chat, modelMeta)`.
- Normalize naming of UI “next\*” flags vs chat settings in one mapping helper: `deriveChatSettingsFromUi(ui, previous?)`.
- Remove state writes that are not persisted or visible (e.g., duplicate backfills) from slices; do in services and persist once.

---

## Messaging/Agent Pipeline

Current issues

- Planning + streaming path contains repeated debug payload assembly and plugin logic.
- Inline tool-call extraction for `web_search` and tutor quiz parsing is mixed with message IO.
- Multiple places accumulate tutor reasoning/hidden state with similar code.

Actions

- Extract pipeline steps into dedicated functions:
  - “Plan step”: `planTurn({chat, prior, tools, system, providerSort})` → `{message, toolCalls, usage}`.
  - “Tool execution”: `executeWebSearch({provider, args})`, `applyTutorToolCall(...)`.
  - “Final stream”: `streamFinal({messages, plugins, callbacks})` using a single `createMessageStreamCallbacks`.
- Replace ad‑hoc JSON detection with centralized helpers from `agent/tools.ts` only.
- Keep tutor tool rendering and hidden-content composition in `tutorFlow.ts`; call it from the pipeline.
- Ensure annotations propagation (PDF parsing) is handled once in request builder and stream callbacks.

---

## Web Search (Brave + OpenRouter Web Plugin)

Current issues

- Brave tool JSON, result mapping, and sources block assembly are embedded in `messageSlice.ts` and partly duplicated in DeepResearch.
- Two ways to hit Brave exist (server route `/api/brave` from UI; direct fetch in DeepResearch).

Actions

- Extract a single `searchFlow` with:
  - `getSearchToolDefinition()` for function tools.
  - `runBraveSearch(q, count)` calling the existing `/api/brave` route when in the browser; call Brave directly only from server modules.
  - `mergeSearchResults([...])` and `formatSourcesBlock(results)`.
- Replace duplicated Brave logic in `messageSlice` with calls to `searchFlow`.
- In `lib/deepResearch.ts`, reuse the same mapping and formatting helpers; keep direct server fetch (it already runs server‑side) but share normalization.

---

## Tutor Mode & Memory

Current issues

- Hidden tutor context assembly is duplicated several times.
- Memory frequency logic and snapshotting appear in multiple places.

Actions

- Extract to `agent/tutorFlow.ts`:
  - `buildHiddenTutorContent(tutor)` — composes Recap + JSON once.
  - `maybeAdvanceTutorMemory({chat, messages, modelId, apiKey})` — returns `{updatedChat, debug}` and persists.
  - `attachTutorUiState(messageId, patch)` — merges UI state and message `tutor` payload consistently.
  - `ensureTutorDefaults({ui, chat})` — computes tutor defaults when enabling/sticky.
- Replace all scattered hidden-content setting with the centralized helper.
- Add tests for `normalizeTutorQuizPayload`, `buildTutorWelcomeFallback`, memory frequency boundaries.

---

## OpenRouter Client & Request Building

Current issues

- Provider sort mapping duplicated.
- PDF plugin composition duplicated.
- Debug payload construction repeated in planning and streaming.

Actions

- In `agent/request.ts`:
  - `providerSortFromRoutePref(pref)`.
  - `pdfPlugins(hasPdf)`.
  - `composePlugins({ hasPdf, searchProvider, searchEnabled })`.
  - `buildDebugBody({model, messages, tools, reasoning, providerSort, plugins})` — used by both plan and stream.
- Use the above in `messageSlice` and `compareSlice`.

---

## Components & UI

Current issues

- `SettingsDrawer.tsx` is large and multi‑concern.
- Swipe gesture logic for the sidebar lives in `app/page.tsx`.
- Attachment ingestion logic in `Composer.tsx` duplicates file handling across paste/drop/input.

Actions

- Split `SettingsDrawer` into sub‑panels under `src/components/settings/`:
  - `ModelsPanel.tsx`, `ChatPanel.tsx`, `TutorPanel.tsx`, `DisplayPanel.tsx`, `PrivacyPanel.tsx`, `DataPanel.tsx`, `LabsPanel.tsx`.
  - Keep a thin wrapper `SettingsDrawer.tsx` to orchestrate tabs and scroll.
- Extract `useSidebarGestures()` hook to `src/lib/hooks/useSidebarGestures.ts`; import in `app/page.tsx`.
- Extract attachment utilities to `src/lib/attachments.ts` (UI side):
  - `readFileAsDataURL(file)`, `detectAudioFormat(file)`, `toAttachment(file)` with max size/type guards.
  - Replace repetitions in `Composer` for paste/drop/input with unified helpers.
- Define constants in `src/lib/constants.ts` for size limits and counts:
  - `MAX_IMAGES_PER_MESSAGE`, `MAX_PDF_SIZE_MB`, `MAX_AUDIO_SIZE_MB`.

---

## Utilities, Types, Naming

Current issues

- `src/lib/env.ts` re-exports `config` with deprecated helpers and is not used.
- `src/lib/pdfRag.ts` appears unused.
- `src/lib/hooks/useDebouncedCallback.ts` appears unused.
- `src/lib/crypto.ts` appears unused.

Actions

- Delete `src/lib/env.ts`; update any imports (none found) to use `@/lib/config` directly.
- Delete unused modules (`src/lib/pdfRag.ts`, `src/lib/hooks/useDebouncedCallback.ts`, `src/lib/crypto.ts`) unless reintroduced with tests.
- Add/clarify types where `any` is prevalent in request builders and stream callbacks; prefer explicit `unknown` → narrow.
- Normalize string literal unions and enums across modules (e.g., route preference vs provider sort).

---

## API Routes & Middleware

Current issues

- Brave search logic duplicated between route and DeepResearch.
- Public path checks rely on exact matches; acceptable but consider trailing slashes.

Actions

- Keep `/api/openrouter/*` and `/api/brave` as-is; expose normalization helpers in shared services.
- Consider adding `startsWith('/access')` in `isPublicPath` only if subroutes arise; otherwise leave matcher to guard assets.
- Add minimal error codes/types for `/api/brave` to aid UI notices consistently.

---

## Testing & Quality Gates

Current baseline

- Node test runner via `tsx --test`; suites exist for: config, ZDR, models, streaming, tutor memory.

Gaps & Actions

- Add unit tests:
  - `lib/cost.describeModelPricing` and edge cases for pricing normalization.
  - `lib/html.extractMainText` (title/description/headings extraction, entity decoding, caps).
  - `lib/agent/tools.extractWebSearchArgs` and `normalizeTutorQuizPayload`.
  - `lib/agent/tutorMemory.*` (frequency calculation boundaries, placeholder handling).
  - `lib/zdr.filterZdrModels` behavior when lists are empty/provider‑only/model‑only.
- Add service tests for `agent/request` helpers (plugin assembly, provider sort mapping, debug body presence).
- Optional integration stub: a fast test for `deepResearch` using stubbed fetch that simulates tool calls.
- Keep tests colocated following `*.test.ts(x)` convention.

---

## Performance & UX

Actions

- Throttle or buffer UI updates during streaming where beneficial (already handled by callbacks; verify flush frequency). Consider a small buffer for high‑frequency token updates if needed.
- Ensure `MessageList` only re-renders affected rows (it already maps by id; verify memoization strategy).
- Prefetch settings/compare drawers as already done; keep `requestIdleCallback` fallback.

---

## Security & Privacy

Actions

- Maintain proxy default (`NEXT_PUBLIC_USE_OR_PROXY=true`) and server‑side keys.
- Keep Brave key server-only (DeepResearch and `/api/brave`); do not introduce new `NEXT_PUBLIC_*` vars.
- Preserve ZDR enforcement; centralize model/provider list caching and notices via shared helpers.

---

## Dead Code & Cleanup (Quick Wins)

Actions

- Delete `src/lib/env.ts`.
- Delete `src/lib/pdfRag.ts` unless kept for future PDF local RAG (currently unused).
- Delete `src/lib/crypto.ts` unless UI key encryption is reintroduced.
- Delete `src/lib/hooks/useDebouncedCallback.ts` if confirm unused.
- Remove unreachable branches and duplicate notice strings where central helpers exist.

---

## Step‑By‑Step Implementation Plan (Milestones)

1. Create shared helpers

- Add `src/lib/agent/request.ts` with provider sort, plugin assembly, debug body, and system preamble helpers.
- Add `src/lib/agent/searchFlow.ts` with tool schema, Brave runner, sources formatting.
- Add `src/lib/agent/tutorFlow.ts` with hidden-content builder, tutor defaults, memory advance orchestration.

2. Refactor slices to use helpers

- Replace in `messageSlice.ts`:
  - Inline Brave tool handling → `searchFlow`.
  - Hidden content backfills and tutor merges → `tutorFlow.buildHiddenTutorContent` + centralized attach.
  - Provider sort and plugin arrays → `agent/request` helpers.
- Replace in `compareSlice.ts`:
  - Provider sort and plugin assembly → `agent/request` helpers.

3. UI extraction

- Split `SettingsDrawer` into panels in `src/components/settings/*` with stable props.
- Add `useSidebarGestures` hook and use in `app/page.tsx`.
- Extract attachment helpers and constants; replace duplicated file handling in `Composer.tsx`.

4. Cleanup & consistency

- Remove unused modules/files (env/pdfRag/crypto/debounced hook) and unused imports.
- Normalize notices and error messages via shared constants.

5. Tests

- Add targeted unit tests for new helpers and existing utilities as outlined.
- Keep `npm run test` green; update README with any new scripts if added.

6. Documentation

- Update README “Architecture” with new module boundaries.
- Document any new env expectations (none beyond existing) and testing guidance.

---

## Non‑Goals (For Future Consideration)

- Token counting via model‑specific encoders (keep current estimator simple).
- Server‑side persistence/export beyond IndexedDB (scope remains local‑first).
- Introducing a global state management change (remain on Zustand; just modularize).

---

## Appendix — Example Refactor Patterns

Hidden tutor content centralization (illustrative)

```ts
// src/lib/agent/tutorFlow.ts
export function buildHiddenTutorContent(tutor: any): string {
  const parts: string[] = [];
  const recap = buildTutorContextSummary(tutor);
  const json = buildTutorContextFull(tutor);
  if (recap) parts.push(`Tutor Recap:\n${recap}`);
  if (json) parts.push(`Tutor Data JSON:\n${json}`);
  return parts.join('\n\n');
}
```

Provider sort and plugin assembly (illustrative)

```ts
export const providerSortFromRoutePref = (pref: 'speed' | 'cost') =>
  pref === 'cost' ? 'price' : 'throughput';

export function composePlugins({
  hasPdf,
  searchProvider,
  searchEnabled,
}: {
  hasPdf: boolean;
  searchProvider: 'brave' | 'openrouter';
  searchEnabled: boolean;
}) {
  const arr: any[] = [];
  if (hasPdf) arr.push({ id: 'file-parser', pdf: { engine: 'pdf-text' } });
  if (searchEnabled && searchProvider === 'openrouter') arr.push({ id: 'web' });
  return arr.length ? arr : undefined;
}
```

These snippets demonstrate consolidation targets; do not change runtime behavior.

---

## Acceptance Criteria

- No user‑visible regressions; identical outputs for the same inputs.
- Slices become thin; heavy logic lives in dedicated, tested helpers.
- Duplicate logic removed: hidden tutor content, provider sort, plugins, debug bodies.
- Unused modules removed.
- New/updated tests pass with `npm run test`; types pass with `npm run lint:types`.
