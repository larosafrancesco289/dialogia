# Dialogia open-source refactor plan

Working document for the pre-open-source refactor. Written 2026-07-25 from a four-part codebase
audit (codebase map, framework coupling, performance profile, provider transport). Each stage
lands independently and leaves the app shippable. Execute stages in order; within a stage, tasks
are roughly ordered by dependency.

## Goals and locked decisions

- **Local-first BYOK is the primary mode.** Client-held keys, no required server. The app must be
  a static SPA that anyone can deploy or run locally.
- **Deployment target is Cloudflare** (Pages + optional Functions), migrating off Vercel.
- **Stack migrates to Vite + TanStack Router (SPA mode).** No SSR: the audit confirmed nothing
  needs it. Justified by taste, simplicity, contributor/agent ergonomics, and the PWA/offline
  story, not only performance.
- **Learning/tutor mode stays first-class but becomes a removable module**: one directory plus a
  small registration surface a fork could delete.
- **Study/dissertation apparatus leaves main entirely** (participant management UI,
  `studyCondition`/`researchMode`, the `study` tier). It moves to a `research` branch together
  with `src/tooling/` (8.6k lines, already quarantined).
- **Hosted machinery stays in-repo as an optional variant**: access gate, tiers, key proxy, rate
  limiting live in a functions directory behind a build flag. BYOK static build is the default;
  the hosted build is what the maintainer deploys.
- **Web search is tiered**: provider-native search (OpenRouter `web` plugin, Anthropic
  `web_search`) works with just a model key; a pluggable search-provider interface lets users add
  a Tavily key (later: Exa or a free provider) for richer tool-based search.
- **Docs collapse** to README, ARCHITECTURE, CONTRIBUTING, and a trimmed DESIGN. AGENTS.md shrinks
  to true invariants only.

## Audit ground truth (why the stages look like this)

- Perf is ~80/20 app-level vs framework. Cold start fetches ~2.7 MB of uncompressed JSON
  (~1.65 MB of it the same ZDR list four times, via a mobile double-bootstrap times a duplicated
  fetch), blocking ~1.3 s. First Load JS is 511 kB gz; KaTeX (74.5 kB, eager via
  `Markdown.tsx`) + the markdown pipeline (72.7 kB) + agent code pulled in by the store
  (~50 kB) are the offenders. Next runtime itself is ~112 kB and its server answers in <40 ms.
- Only ~1.5k of ~60k lines are Next-coupled. Two server components, zero router usage, zero
  server actions. The one SSR feature (`initialIsMobile` from headers) is better done client-side.
- Tutor mode is ~10.9k lines (23% of the shipping app), ~90% co-located. The removability
  blockers are type-level: `ToolName = 'web_search' | 'web_fetch' | TutorToolName`
  (`src/lib/tools/registry.ts`), the scheduler parameterized by `TutorPhase`
  (`src/lib/agent/tools/scheduler.ts`, `planning/types.ts`), 13 of 42 store actions,
  `ChatSettings.features.tutor` required, ~6 hard-wired UI mounts.
- BYOK does not exist: no key input anywhere in the UI; keys are build-time env vars. The
  transport abstraction underneath (`src/lib/transport/*`) is sound; OpenRouter and native
  Anthropic are both fully implemented.
- Hand-maintained state mirrors: 4 for store state, 3 for UI state, 3 for persisted state.
- ~2,300 lines of dead components, an unlinked 896-line sandbox route, two half-removed features
  (`deepResearch`: readers but no writers; `parallelModels`: only ever assigned `[]`).
- Secrets are clean: `.env.local`, `vercel.env`, `ACCESS_CODES_SECRET.txt` gitignored, never in
  git history.

---

## Stage 0 — Quick wins (DONE — merged to main)

**Outcome: First Load JS 511 kB → 334 kB gz (−35%); duplicate cold-start fetches eliminated;
mid-stream errors surfaced; 2,908 dead lines deleted. CI green. Full report in
REFACTOR_LOG.md.** Follow-ups noted there: markdown-chunk prefetch to remove a reload flash
(do in Stage 2), pre-existing orphaned swipe CSS in `styles/mobile.css`.

Perf and correctness fixes plus dead-code deletion. All framework-independent; everything
carries over to Vite.

1. Single bootstrap owner + reentry guard (`useAppBootstrap` is called from both HomeClient and
   MobileShell; `bootstrapApp` has no guard).
2. ZDR: fetch endpoints once (not twice in `ensureZdrLists`), in-flight dedupe, persist
   `zdrModelIds`/`zdrProviderIds`/`zdrFetchedAt` so the 6 h TTL survives reload. Optionally
   `s-maxage` on the two list proxy GETs.
3. Lazy KaTeX (plugin + CSS behind a math-delimiter check) and the markdown renderer behind one
   lazy boundary, preserving StreamingMarkdown's memoized-block contract.
4. Store stops importing `@/lib/agent` at module load (type-only imports; runtime behind dynamic
   import on first send), to the extent achievable without deep refactors.
5. Streaming parser: surface mid-stream `{"error":...}` chunks (currently silent truncation),
   accept `delta.reasoning_content`, join multi-line SSE `data:` per spec. With tests.
6. Delete audit-verified dead code (list in the Stage 0 task prompt; each item re-verified before
   deletion). `deepResearch` / `parallelModels` deliberately untouched until Stage 1.

**Done when:** `scripts/ci.sh` passes; before/after build table captured; cold start no longer
fetches duplicate ZDR payloads.

## Stage 1 — Decouple (DONE — merged to main 2026-07-25, after independent review + fixes; see REFACTOR_LOG.md)

Goal: the type surgery that makes tutor removable, kills the mirror farms, and gets research
apparatus out of main. Pure TypeScript work, framework-independent, so it happens before the
migration to keep the migration diff mechanical.

1. **Tool registry becomes open.** Replace the hard-coded `Record<TutorToolName, ...>` tables and
   the `ToolName` union with a registration API. Implement to **Design A** below.
   `web_search`/`web_fetch` register from core; tutor tools register from the tutor module.
2. **Neutral tool-gating policy.** Lift `TutorPhase` out of `scheduler.ts`, `schedulingPolicy.ts`,
   `planning/types.ts`: the scheduler consumes a policy interface; the tutor module supplies the
   phase-based implementation. Implement to **Design A** below.
3. **Optional type extensions.** `ChatSettings.features.tutor`, `Message.tutor`,
   `Message.planUpdates`, `UiSnapshot.tutor`, `UiSnapshot.plan` become optional (or move behind an
   extensions bag). Persisted-data compat: old chats with these fields must still load.
4. **Store composition redesign (kills the mirrors).** Slice-registration surface so
   `StoreActions` is composed, not one flat 42-action type; tutor actions move to a
   `TutorStoreActions` composed in `store/index.ts`. Replace the hand-maintained test/headless
   store literals with a single factory built from the real initial state + real slices, so adding
   a field/action touches one place. Same treatment for the persisted-state projection
   (`buildPersistedState`/`mergePersistedUiState`/migrations) where feasible. Implement to
   **Design B** below.
5. **Tutor module consolidation.** Move the 21 scattered tutor files (list in the codebase-map
   report) under one root (e.g. `src/modules/tutor/` or `src/tutor/`), with the ~6 UI mounts
   becoming optional slots. Acceptance: deleting the directory plus its few registration lines
   leaves a compiling, working chat app.
6. **Research apparatus off main.** Create `research` branch containing today's state. On main:
   delete `src/tooling/eval`, `StudySessionSettings.tsx` + `useStudySessionControls.ts`,
   `src/lib/study/`, `studyCondition`/`researchMode` from persisted UI state (with a migration
   dropping them), the `study` tier and `forceTutorMode`. Keep `src/tooling/headless` only if the
   test suite still uses it; otherwise it goes to the branch too.
7. **Half-features resolved.** Remove `deepResearch` read paths + schema (persisted-data
   migration: drop the field) and `parallelModels` (same), or revive them deliberately; default is
   remove.

**Done when:** ESLint boundary for the tutor module added; tutor-delete experiment compiles and
runs; store field/action additions touch one file each; `research` branch pushed; ci green.

## Stage 2 — Migrate (Vite + TanStack Router + Cloudflare)

1. Scaffold Vite + TanStack Router SPA; 3 routes today collapse to `/` and `/access`
   (hosted-only). `index.html` gets the theme-init inline script (`injectThemeClass()` already
   returns an IIFE string) and static meta tags.
2. Replace: `next/font` with self-hosted `@fontsource` woff2 (audit: trim the 7-weight/150 kB
   font payload while here); `next/image` with `<img>` (4 of 5 uses are already unoptimized);
   `lazyClient` reimplemented over `React.lazy`; `NEXT_PUBLIC_*` reads (all in
   `src/lib/env/public.ts`) become `import.meta.env.VITE_*`; fix the two non-public env reads
   (`public.ts` reading `TAVILY_API_KEY`/`LOG_LEVEL` that are always undefined in the browser).
3. `initialIsMobile` redesign: straight `matchMedia` before first render; delete the `mounted`
   dance in `useAppBootstrap`. No UA sniffing, no HTMLRewriter.
4. **Hosted variant as Cloudflare Pages Functions** (`functions/api/*`): port `routeBuilder` (only
   `NextRequest` types + cookie parsing), consolidate auth crypto on the existing `.edge.ts`
   WebCrypto implementations (delete `token.server.ts`), middleware becomes `_middleware.ts`,
   `getClientIp` reads `CF-Connecting-IP`, rate limiting via Upstash (already implemented) or
   Cloudflare-native. Access gate ships only in the hosted build.
5. **PWA**: `vite-plugin-pwa` with manifest (the 192/512 icons already exist in `public/`,
   currently unreferenced), offline app-shell service worker, `theme_color`. Fix icon references
   (currently `logo.jpg` for everything). `_redirects` SPA fallback, `robots.txt`.
6. Remove `@vercel/analytics` (optionally Cloudflare Web Analytics), `eslint-config-next` (keep
   the framework-neutral `no-restricted-imports` blocks verbatim), Next deps and config. Port the
   two Next-typed tests (`middleware.auth`, `apiErrorContracts`) to plain `Request`.

**Done when:** BYOK build deploys as pure static Pages; hosted build deploys with functions; app
installs as PWA and loads offline; ci green; Vercel deployment retired.

## Stage 3 — BYOK and providers

1. **Key management.** Settings UI + storage for per-provider keys. Storage decision: prefer
   IndexedDB over the localStorage persist blob; must be excluded from export/import
   (`exportAll`/`importAll`); do an XSS review of markdown rendering before shipping (model
   output is untrusted and keys live in the same origin).
2. **First-run flow.** Replace the `missing_client_key_or_proxy` notice path
   (`modelSlice.ts` → `NOTICE_MISSING_CLIENT_KEY`) with a setup modal: pick provider(s), paste
   key, or point at a local endpoint. Purge env-var-speak from user-facing notices
   (`notices.ts` literally says "Missing NEXT_PUBLIC_ANTHROPIC_API_KEY").
3. **Anthropic browser-direct**: add `anthropic-dangerous-direct-browser-access: true` in
   `anFetch`. Also: stop throwing on unmapped model ids (`ANTHROPIC_MODEL_ALIAS_MAP`), pass
   through `input_audio` or surface a notice instead of silently dropping it.
4. **OpenAI-compatible endpoints** (Ollama, LM Studio, llama.cpp, vLLM): implement to
   **Design C** below. Endpoint descriptors with explicit capability toggles replace the closed
   `ModelTransport` union; capability-gated body builder (minimal fields only; no
   `reasoning`/`plugins`/`provider`/`modalities`; skip `cache_control` injection and the
   `X-Title`/`HTTP-Referer` headers). Free-text model-id entry. Skip name-regex capability
   heuristics for user-configured endpoints. Title generator gets a "use chat model / disabled"
   path.
5. **Search-provider interface.** Default: provider-native search (OpenRouter `web` plugin;
   Anthropic already reinterprets it as native `web_search_20250305`, a pattern to keep).
   Optional: BYO Tavily key via the pluggable interface in **Design D** below (verify Tavily
   browser CORS; if blocked, route through the optional hosted function). Exa or a free provider
   must be an additive implementation. Tier-based search gating dies with the gate in BYOK
   builds.
6. Hosted proxy hygiene: in a BYOK world the proxy must never become an open relay; it keeps
   injecting only the server key for the hosted deployment's own users, behind the gate.

**Done when:** fresh user with only an OpenRouter or Anthropic key is chatting in under a minute;
Ollama at a custom base URL works with tools/search cleanly degraded (visible notice, not
silence); no env-var key path remains in the BYOK build.

## Stage 4 — Docs and release

1. README rewrite: what it is, screenshots, 60-second BYOK quickstart, local-models quickstart,
   deploy-your-own (Cloudflare), hosted-variant appendix.
2. ARCHITECTURE.md rewritten against the post-refactor reality (the current one documents files
   and slices that don't exist; the "public module surfaces" have zero importers). CONTRIBUTING.md
   absorbs commands/conventions/PR expectations. DESIGN.md trimmed. PRODUCT.md and
   CONFIGURATION.md absorbed or deleted.
3. AGENTS.md shrinks to pointers plus the few true invariants that survive Stage 1 (streaming
   flush batching + checkpointing; lazy message hydration; layer boundaries). Everything a model
   can infer from the code gets deleted.
4. License (owner's choice), CoC as desired, issue templates optional. `bun run knip` or similar
   dead-export check wired into CI would keep Stage 0's cleanup from regressing.
5. Final pass: repo history check for anything private (audit says clean), delete stale local
   files (`vercel.env` after migration), squash-review the whole diff.

**Done when:** a newcomer can go from `git clone` to a working local BYOK app with only README;
docs describe nothing that doesn't exist.

---

## Baked designs

These designs were written against the actual code (July 2026) and are binding at the interface
level: implement the named types, boundaries, and behaviors as specified. Internals, file-local
naming, and mechanical details are the executor's choice. If code reality contradicts a detail
here, follow the design's intent, adapt the detail, and record the deviation in the stage report.

### Design A — Open tool system (Stage 1)

Current state, for orientation: `src/lib/tools/registry.ts` already has the right entry shape
(`ToolRegistryEntry = { definition, metadata, handler }`) but is a static `Record` over a closed
`ToolName` union, with tutor metadata fields (`phases`, `priorityGroup`, tutor categories) baked
into core `ToolMetadata`. The scheduler (`src/lib/agent/tools/scheduler.ts`) hard-codes a
partition into meta/content/search plus a phase-driven content-priority function.

**A1. Registry.** Core registry keyed by `string`, mutated only through registration:

```ts
// src/lib/tools/registry.ts — core, zero tutor imports
export type ToolKind = 'action' | 'content' | 'meta';
// 'content': at most one runs per round (today's tutor_content semantics)
// 'meta': always runs first (today's tutor_meta semantics)
// 'action': ordinary tool (web_search, web_fetch)

export type ToolMetadata = {
  module: string; // 'core' | 'tutor' | future module ids
  kind: ToolKind;
  ext?: Record<string, unknown>; // module-private metadata (tutor: phases, priorityGroup, tags)
};

export type ToolRegistryEntry = {
  definition: ToolDefinition;
  metadata: ToolMetadata;
  handler?: PlanningToolHandler;
};

export function registerTool(name: string, entry: ToolRegistryEntry): void; // idempotent re-register OK
export function getTool(name: string): ToolRegistryEntry | undefined;
export function listTools(filter?: { module?: string; kind?: ToolKind }): string[];
```

`ToolName` the closed union is deleted; call sites use `string`. `isTutorContentTool` /
`isTutorMetaTool` / `isSearchTool` become kind/module checks (`getTool(name)?.metadata.kind`).
Search-tool identification: `metadata.module === 'core' && kind === 'action'` is too loose; give
core search tools `ext: { search: true }` or a dedicated helper owned by the search feature.
Tutor's per-tool metadata (`phases`, `priorityGroup`, `tags`) moves into `ext`, read only by
tutor-module code through typed accessor helpers that live in the tutor module.

**A2. Scheduling policy.** The scheduler keeps its core duties (search dedupe, the
3-searches-per-round cap, meta-first / one-content-per-round ordering by `kind`) and loses all
phase knowledge. Priority among competing content tools is delegated:

```ts
// src/lib/agent/tools/scheduler.ts — core
export type ScheduleInput = {
  allowSearch?: boolean;
  alreadyUsedContent?: boolean;
  contentPriority?: (candidates: string[]) => string[]; // supplied by active module; identity default
};
export function schedulePlanningToolCalls(toolCalls: ToolCall[], input?: ScheduleInput): ToolCall[];
```

The tutor module builds `contentPriority` from its phase state (today's `buildContentPriority`
moves there verbatim). `ScheduleContext.phase/hasPlan/hasActiveNode` disappear from core.

**A3. Planning context.** `PlanningContext` (`src/lib/agent/planning/types.ts`) is currently
`{ phase: TutorPhase; allowedTutorTools; toolPolicy: TutorToolPolicy }`. It becomes:

```ts
export type ToolGate = {
  isAllowed(name: string): boolean; // per-turn allowlist
  onBudgetExceeded?(name: string): 'skip' | 'stop';
};
export type PlanningContext = {
  toolDefinitions: ToolDefinition[]; // already-gated list sent to the model
  gate: ToolGate;
  moduleContext?: Record<string, unknown>; // opaque per-module turn state
};
```

The tutor module constructs the gate from phase + `TutorToolPolicy`.
`PlanningExecutionState`'s tutor fields (`learnerModel`, `planUpdates`, `updatedPlan`,
`currentPlan`, `quizCallsThisTurn`, `usedTutorContentTool`) move behind a
`moduleState: Record<string, unknown>` bag with typed accessors in the tutor module;
`usedTutorContentTool` generalizes to `usedContentTool` (it's the `kind: 'content'` semantics,
not a tutor concept).

**A4. Module registration surface.** One file lists enabled modules; deleting the tutor module
means deleting its directory and its line here:

```ts
// src/lib/modules.ts (or src/modules/index.ts)
export type AppModule = {
  id: string;
  registerTools?(): void; // calls registerTool(...)
  storeSlice?: SliceCreator; // see Design B
  persistFragment?: PersistFragment; // see Design B
  // UI mounts are typed slots resolved by the shell:
  panels?: Partial<
    Record<'rightPanel' | 'messagePanel' | 'headerControls' | 'settingsSection', ComponentType>
  >;
};
export const ENABLED_MODULES: AppModule[] = [coreModule, tutorModule];
```

Acceptance for the whole design: removing `tutorModule` from `ENABLED_MODULES` and deleting the
tutor directory leaves the app compiling, chatting, and passing non-tutor tests.

### Design B — Store composition without mirrors (Stage 1)

**B1. One initializer, exported.** The store initializer currently inlined in
`src/lib/store/index.ts` moves to `src/lib/store/createStore.ts`:

```ts
export function buildStoreInitializer(
  modules: AppModule[] = ENABLED_MODULES,
): StateCreator<StoreState>;
```

`index.ts` keeps only `createWithEqualityFn(persist(buildStoreInitializer(), {...}))`. The test
helper (`tests/helpers/createTestStoreState.ts`), the inline `baseState` in
`tests/updateMessageInChat.test.ts`, and `src/tooling/headless/store.ts` are all rewritten to
call `buildStoreInitializer()` with a real zustand `createStore`, overriding individual actions
only where a test needs a stub. The three hand-maintained 42-action mirror literals are deleted.
This is the acceptance test: adding a store field or action must require editing exactly one
slice file.

**B2. Composed action types.** `StoreActions` (`src/lib/store/actionsTypes.ts`) splits: each
slice file owns and exports its `XSliceState` / `XSliceActions`; `StoreState` is the intersection
composed in `store/types.ts`. The 13 tutor actions and `MessageTutor`-typed surfaces move to the
tutor module's slice file; core types must not import from the tutor module (type-only imports
included; enforce with the existing `no-restricted-imports` pattern).

**B3. Persistence fragments.** `buildPersistedState` / `mergePersistedState` stop enumerating
nested shapes by hand. Each slice (and each module) exports a fragment:

```ts
export type PersistFragment = {
  partialize(state: StoreState): Record<string, unknown>;
  merge(current: StoreState, persisted: Record<string, unknown>): Partial<StoreState>;
};
```

Core persistence composes fragments; migrations stay central in `migrations.ts` (they operate on
raw persisted JSON and may reference removed fields). Persisted key names must not change (users'
localStorage must survive); write a compatibility test that round-trips a pre-refactor persisted
blob through the new merge.

### Design C — Provider endpoints (Stage 3)

Replaces the closed `ModelTransport = 'openrouter' | 'anthropic'` union. Two-level split: a
closed set of transport _implementations_, an open set of user-configured _endpoints_.

```ts
// src/lib/transport/endpoints.ts
export type TransportKind = 'openrouter' | 'anthropic' | 'openai-compatible';

export type EndpointCapabilities = {
  tools?: boolean;
  vision?: boolean;
  reasoning?: boolean; // emit reasoning params
  streamUsage?: boolean; // stream_options.include_usage
  parallelToolCalls?: boolean;
  promptCaching?: boolean; // emit cache_control blocks
};

export type ProviderEndpoint = {
  id: string; // 'openrouter' | 'anthropic' | slug for user-added
  kind: TransportKind;
  label: string; // "OpenRouter", "LM Studio", ...
  baseUrl?: string; // required for openai-compatible; built-ins use defaults
  apiKeyRef?: string; // reference into the key store, never the key itself
  useProxy?: boolean; // hosted build only
  capabilities?: EndpointCapabilities; // explicit, no regex inference, for user-added endpoints
};
```

- `TransportAuth` becomes `{ endpoint: ProviderEndpoint; apiKey?: string }` (key resolved from
  the key store at request time). The transport registry stays a closed
  `Record<TransportKind, TransportClient>` (3 entries; `openai-compatible` is a slimmed
  OpenRouter client with capability-gated body building). Exhaustive `Record<ModelTransport, X>`
  maps (`TITLE_MODELS`, `TRANSPORT_LABELS`, `TRANSPORT_AVAILABILITY`) become functions over
  `ProviderEndpoint` (label from `endpoint.label`; title model per-endpoint optional with
  "use chat model" fallback).
- `ModelDescriptor` gains `endpointId`; model identity is `(endpointId, transportModelId)`.
  Keep `resolveModelTransport`'s prefix heuristics only as a legacy fallback for persisted chats
  that predate endpoints (`anthropic/` → the built-in anthropic endpoint, else openrouter);
  write a migration test for an old chat.
- Endpoint configs (not keys) live in a new persisted slice. The two built-ins are always
  present and non-deletable. Keys live in an IndexedDB-backed key store
  (`src/lib/keys/store.ts`: `getKey/setKey/deleteKey` by `apiKeyRef`), excluded from
  `exportAll`/`importAll`.
- Capability gating is _authoritative_ for user-added endpoints: no name-regex inference
  (`isVisionSupported`-style heuristics apply only to metadata-rich built-ins). Ungated fields
  are never emitted; degraded features surface a notice, never silence.

### Design D — Search providers (Stage 3)

Two distinct mechanisms, kept distinct on purpose:

1. **Provider-native search** (OpenRouter `web` plugin; Anthropic native `web_search`): a
   request-body feature of the model call, needs no extra key, remains the default. Not a
   `SearchProvider`.
2. **Tool-based search** (today's Tavily `web_search`/`web_fetch` tools): formalized as:

```ts
// src/lib/search/providers/types.ts
export type SearchProvider = {
  id: string; // 'tavily', later 'exa', ...
  label: string;
  requiresKey: boolean; // key comes from the same key store as Design C
  search(args: NormalizedSearchArgs, ctx: SearchContext): Promise<SearchOutcome>;
  fetchPage?(args: NormalizedFetchArgs, ctx: SearchContext): Promise<FetchOutcome>; // optional
};
```

Registered in a small registry like tools; the composer's search toggle offers native search
always, and tool-based search when a configured provider has a key. The existing
`searchProvider === 'tavily'` branches in the tool handlers collapse into provider dispatch.
`web_fetch` availability follows `fetchPage` presence.

---

## Autonomy protocol (for near-autonomous execution)

The designs above plus these rules are what makes unattended execution safe.

**Defaults (apply without asking):**

- Prefer deleting dead code over preserving it; prefer the smallest interface that satisfies the
  design; prefer optional fields over new required ones.
- When a plan detail and code reality disagree, follow the design's _intent_, adapt, and log the
  deviation in the stage report.
- When a library/tool choice is unspecified, pick the boring mainstream option.

**Hard stops (halt the stage and ask the owner):**

- Anything that could lose user data: IndexedDB schema changes without a migration, persisted-key
  renames, destructive git operations.
- Changing a Baked Design's public interface (names/shapes above), not just its internals.
- Scope growth: work not in the stage's task list that exceeds roughly a day.
- Any need to push, merge, publish, or deploy.

**Per stage:** work on a fresh branch; run end-to-end without pausing for approval — do NOT enter
plan mode and do not check in mid-stage (this document is the approved plan; the hard stops above
are the only reasons to interrupt). Self-review the approach against this document before writing
code, then execute; `scripts/ci.sh` green before done; append a stage report (what changed,
deviations from design, before/after numbers where relevant, follow-ups discovered) to
`REFACTOR_LOG.md` at the repo root. The next stage's session reads REFACTOR_PLAN.md +
REFACTOR_LOG.md and nothing else.

## Working rules for executors (Opus sessions/subagents)

- One branch per stage; logical commits; `scripts/ci.sh` before declaring done; no pushes or
  merges without the owner's say-so.
- No drive-by refactors outside the current stage's scope, even obvious ones; note them in the
  report instead.
- Preserve the two audited invariants at all times: streaming flush batching + IndexedDB
  checkpointing, and lazy message hydration.
- Persisted-data compatibility is non-negotiable: existing users' IndexedDB chats and
  localStorage prefs must survive every stage (migrations where needed).
- Keep ARCHITECTURE.md/DESIGN.md updates for Stage 4 unless a stage makes them actively wrong.
