# Dialogia Refactor Plan

This plan outlines a focused, incremental refactor to reach higher standards of simplicity, modularity, consistency, and maintainability. It avoids wholesale rewrites and prioritizes small, verifiable steps.

## Objectives

- Reduce complexity and duplication across state, API, and UI layers
- Improve naming, module boundaries, and documentation
- Centralize configuration and environment handling
- Strengthen privacy and auth gate correctness
- Prepare the codebase for tests and incremental feature evolution

---

## Cross‑Cutting Naming + Conventions

Issues

- Non‑hook utilities prefixed with `use*` are misleading (e.g., `src/lib/env.ts:9`).
- Mixed terminology and defaults for ZDR (“Zero Data Retention”) preference between code and README.
- Large modules mixing multiple concerns (e.g., `src/lib/store/messageSlice.ts`) reduce readability and testability.

Actions

- Rename non‑hook env helpers:
  - Rename `useOpenRouterProxy` to `isOpenRouterProxyEnabled` (pure util, not a hook).
  - Rename `defaultZdrOnly` to `getDefaultZdrOnly` for clarity.
- Confirm ZDR defaults OFF by default:
  - Keep default as false when unset (privacy toggle is opt‑in), and update README to match.
  - Document the source of truth for the default (README + `src/lib/env.ts`).
- Split large modules by concern with narrow exports (details below per area).

---

## Environment + Configuration

Issues

- README previously suggested ZDR defaulting to on, but code defaults to off (`src/lib/env.ts:15`–`17`).
- Env access is scattered; no single typed config surface.

Actions

- Create `src/lib/config.ts` and centralize typed reads with safe defaults:
  - `getPublicOpenRouterKey()`, `isOpenRouterProxyEnabled()`, `hasBraveKey()`, `getDefaultZdrOnly()`, `getRoutePreferenceDefault()`.
  - Move logic from `src/lib/env.ts` and re‑export for compatibility (deprecate old names).
- Replace `process.env` reads across the codebase with calls to `config.ts`.
- Update README and `.env.example` to state ZDR is off by default and is an optional privacy toggle.

---

## Auth Gate + Middleware

Issues

- Cookie name duplicated in middleware and server lib (`middleware.ts:3` vs `src/lib/auth.ts`).
- Middleware needs to run on the edge (WebCrypto) while server lib uses Node crypto; constants cannot be imported as‑is.
- `PUBLIC_PREFIXES` contains `/public`, which is not a user path in Next static routing (see `middleware.ts:16`).
- Redundant allowlisting logic: both `config.matcher` and `isPublicPath` attempt to filter routes.

Actions

- Extract shared auth constants and minimal helpers into an isomorphic module:
  - Create `src/lib/auth/shared.ts` defining `AUTH_COOKIE_NAME` and base64url helpers.
  - Create `src/lib/auth/edge.ts` for edge verification (WebCrypto), used by `middleware.ts`.
  - Keep `src/lib/auth.ts` for server‑only helpers (Node `crypto`), importing constants from `shared.ts`.
- Use the shared constant in `middleware.ts` to eliminate duplication.
- Remove `/public` from `PUBLIC_PREFIXES` (`middleware.ts:16`).
- Simplify route filtering to a single approach:
  - Prefer `config.matcher` as the canonical filter. In `isPublicPath`, keep only path checks that must be dynamic at runtime.
- Add unit tests for token creation/verification parity (server vs edge) once a test harness is in place.

---

## API Client + Proxy

Issues

- Proxy/header logic duplicated across server routes and client (`src/lib/openrouter.ts`, `app/api/openrouter/*`).
- Timeouts and error mapping vary.

Actions

- Create a minimal OR client wrapper: `src/lib/api/orClient.ts`:
  - `orFetchModels()`, `orChatCompletions({ stream?: boolean })`, `orFetchZdrEndpoints()`.
  - Unify headers (`HTTP-Referer`, `X-Title`), conservative timeouts, and error mapping.
  - Internally select proxy vs direct based on `isOpenRouterProxyEnabled()` and runtime (browser/server).
- Replace direct OpenRouter fetches and proxy calls with the wrapper in:
  - `src/lib/openrouter.ts` (thin wrapper remains or is folded into `api/orClient.ts`).
  - `src/lib/deepResearch.ts` to reuse request building and error handling.
- Coalesce ZDR provider/model list fetching into a single exported helper in the wrapper.

---

## State Management (Zustand)

Issues

- `src/lib/store/messageSlice.ts` is large and cross‑cuts concerns: composition of messages, attachments processing, tool orchestration, streaming IO, DeepResearch branching, tutor memory updates, debug logging, and metrics.
- ZDR enforcement logic appears in multiple places (message/compare/model slices).
- Debug payload plumbing is always present, not clearly dev‑only.

Actions

- Extract message concerns into dedicated modules:
  - `src/lib/agent/buildMessages.ts` (exists as `conversation.ts` but extend it):
    - Keep only prompt construction and token‑window budgeting.
  - `src/lib/agent/attachments.ts`:
    - Image/audio/PDF pre‑processing, base64 handling, file→dataURL conversion, content blocks.
  - `src/lib/agent/streamHandlers.ts`:
    - Shared SSE parsing, reasoning/image/annotation event handling, `stripLeadingToolJson` usage.
  - `src/lib/agent/tools.ts`:
    - Web search tool function shapes, inline extraction, tutor tool parsing.
  - `src/lib/agent/deepResearchOrchestrator.ts`:
    - DeepResearch branch handling invoked by store; leave HTTP in `app/api/deep-research/route.ts`.
- Extract ZDR enforcement to `src/lib/zdr.ts`:
  - `enforceZdrModelSelection(modelId, cache)` used by send/compare/model loading; centralize fallback logic (explicit model list → providers → strict failure).
- Gate debug UI/state by `ui.debugMode` or `process.env.NODE_ENV !== 'production'`:
  - Wrap writes to `ui.debugByMessageId` and heavy debug strings with a guard.
- Keep `StoreState` surface stable; refactor internals module‑by‑module.

---

## Components

Composer (`src/components/Composer.tsx`)

- Issues: Mixed concerns (text input, slash commands, file intake, menus, chips, estimates) in one component; long file.
- Actions:
  - Extract subcomponents:
    - `ComposerInput` (textarea, autofocus, slash key handling)
    - `ComposerActions` (attach/search/reasoning/send controls for desktop)
    - `ComposerMobileMenu` (mobile actions sheet)
    - `AttachmentPreviewList` (with image/pdf/audio badges)
  - Extract slash suggestion generator into a pure util `src/lib/slash.ts` with typed suggestions.
  - Move attachment ingestion to `src/lib/agent/attachments.ts` and call from Composer.

MessageList (`src/components/MessageList.tsx`)

- Issues: Handles autoscroll, copy/edit/branch, meta panels, and lightbox in one component.
- Actions:
  - Split into:
    - `MessageList` (virtualized list + scroll management only)
    - `MessageCard` (single message presentation + local actions)
    - `MessagePanels` (reasoning/sources/debug subpanel bundle)
  - Consider simple virtualization (e.g., windowed rendering) to improve large chat performance.

ModelPicker (`src/components/ModelPicker.tsx`)

- Issues: Complex logic, repeated formatting, ad‑hoc filtering.
- Actions:
  - Extract capability calculation to a util (`src/lib/models.ts` exports already exist; compose these helpers).
  - Debounce filter input and memoize visible options.
  - Consolidate `zdr` warnings/labels using centralized ZDR helper.

ChatSidebar (`src/components/ChatSidebar.tsx`) + Drag & Drop (`src/lib/dragDrop.ts`)

- Issues: Global `currentDragData` and manual DnD wiring.
- Actions:
  - Replace global variable with component state or a lightweight context.
  - Encapsulate DnD logic in a hook `useDragAndDrop()` that never writes to module globals; return handlers and data.
  - Optionally consider pointer‑gesture driven reordering if DnD remains complex.

TopHeader (`src/components/TopHeader.tsx`)

- Actions:
  - Extract the mobile overflow menu into its own controlled popover component to reuse behaviors.

Message Subcomponents (`src/components/message/*`)

- Actions:
  - Keep panels small and focused; convert any repeated className strings to small reusable primitives.

---

## Styles + Tokens

Issues

- `app/globals.css` is large and mixes layout primitives, component styles, and animations.
- Design tokens live in `styles/francesco-bootstrap.css` but there are repeated semantic classes in globals.
- Global `*` transitions may affect perf and cause unintended transitions.

Actions

- Keep tokens and primitives in `styles/francesco-bootstrap.css` and move component‑scoped rules into CSS modules or colocated `.css` next to components where practical.
- Prune/limit global `* { transition: ... }` to only high‑value properties or remove for perf; respect `prefers-reduced-motion` (already present) and simplify default transitions.
- Reduce duplication of chip/button classes by consolidating shared primitives (e.g., `.badge`, `.btn`, `.btn-outline`) with minimal variants.
- Document CSS structure in README (what lives where, how to add variants).

---

## Data + Curated Models + Presets

Issues

- Two presets modules: `src/data/presets.ts` (unused) and `src/lib/presets.ts` (Dexie‑backed persistence).
- Curated models are used both in constants and ModelPicker; no health‑check to ensure curated IDs exist in fetched models.

Actions

- Delete or integrate `src/data/presets.ts`; seed optional defaults by importing into `src/lib/presets.ts` on first run if desired.
- Add a curated model health check during `loadModels`:
  - If curated default is missing from available models, show a one‑line UI notice and fallback to first available model.
- Keep curated lists small; document where to add/edit curated entries and the selection criteria.

---

## DeepResearch

Issues

- Algorithm is embedded in `src/lib/deepResearch.ts` and branching logic appears in the store.
- Mixed concerns: HTML parsing, tool orchestration, and OpenRouter calls.

Actions

- Move orchestration entry from store to a dedicated orchestrator (`src/lib/agent/deepResearchOrchestrator.ts`) that calls into `deepResearch.ts`.
- Extract HTML parsing helpers from `deepResearch.ts` to `src/lib/html.ts` with clear contracts and unit tests.
- Reuse `api/orClient.ts` for OR requests; keep Brave fetcher self‑contained.

---

## Models + Capabilities

Issues

- Capability detection relies on multiple heuristics in `src/lib/models.ts`. Some duplication and loose `any` usage.

Actions

- Tighten types around `ORModel['raw']` via a lightweight type to reduce `any` where feasible.
- Add unit tests for capability detection paths (vision/audio/image output, reasoning) using sample model payloads.
- Keep `formatModelLabel` and `describeModelPricing` as the canonical normalization helpers and remove ad‑hoc labels elsewhere.

---

## Cost + Metrics

Issues

- Cost calculation and metrics formatting are spread between `src/lib/cost.ts` and UI.

Actions

- Provide small formatters:
  - `formatTokens(value)`, `formatThroughput(tokens, ms)`, and reuse across UI components.
- Use a single descriptor for model pricing (`describeModelPricing` already exists); avoid re‑formatting in components.

---

## Accessibility + UX

Actions

- Ensure all icon‑only buttons have `aria-label` (most do; verify in `TopHeader`, `ModelPicker`, `Composer`, `MessageList`).
- Verify keyboard navigation in popovers/menus (`ModelPicker`, composer mobile menu, settings drawer). Many are already ARIA‑labeled; keep it consistent.
- Add `role`, `aria-expanded`, `aria-controls` consistently to custom popovers.

---

## Performance

Actions

- Virtualize long message lists (simple windowing) to reduce DOM churn.
- Debounce model filtering in `ModelPicker` and expensive compute in `Composer`.
- Keep `requestIdleCallback` warm‑up for drawers; ensure fallbacks avoid long main‑thread tasks.
- Confirm Mermaid and Prism are always dynamically loaded (they are); keep `securityLevel: 'strict'` for Mermaid.

---

## Testing Strategy (incremental)

Add unit tests where logic is pure and deterministic:

- Env defaults and config parsing (`src/lib/config.ts`): ZDR default, proxy flag.
- Auth token parity (server vs edge) with known secret and payload.
- `stripLeadingToolJson` cases (fenced JSON and inline blocks).
- Model capability detection helpers.
- Tutor memory normalization + limit enforcement.
- Token estimate and cost calculation.
- HTML extraction from `deepResearch` parser using small HTML fixtures.

Introduce tests gradually (Jest or Vitest) and colocate as `*.test.ts(x)`.

---

## Security + Privacy

Actions

- Enforce ZDR consistently via centralized helper before sends and compares; provide a clear user notice when blocked.
- Ensure no leakage of secrets to client (proxy flag + server routes already in place)
  - Audit `NEXT_PUBLIC_*` usage remains minimal.
- Review `middleware.ts` matcher and `isPublicPath` to avoid accidental gating of public assets; remove `/public` prefix check.

---

## Documentation + Scripts

Actions

- Update README to reflect:
  - ZDR default OFF (opt‑in privacy toggle exposed in Settings and env via `NEXT_PUBLIC_OR_ZDR_ONLY_DEFAULT`)
  - New env functions and naming
  - High‑level architecture map (state slices, agent modules, API wrapper)
- Add `npm run test` and document how to run tests.
- Keep `.env.example` synchronized with README.

---

## Proposed Module Map (Illustrative)

- `src/lib/config.ts` — central env/config
- `src/lib/api/orClient.ts` — OpenRouter client (proxy/direct)
- `src/lib/zdr.ts` — ZDR lists + enforcement
- `src/lib/agent/`:
  - `buildMessages.ts` — LLM payload construction
  - `attachments.ts` — file ingestion + content blocks
  - `streamHandlers.ts` — SSE parsing + callbacks
  - `tools.ts` — tool schemas + inline extraction
  - `deepResearchOrchestrator.ts` — store‑facing orchestration
- `src/lib/auth/`:
  - `shared.ts` — constants + base64url
  - `edge.ts` — WebCrypto verify
  - `index.ts` — Node crypto (current `auth.ts`)
- `src/lib/html.ts` — HTML extraction helpers (from DeepResearch)

---

## Example Refactors (Patterns)

- Rename env util (non‑hook):

  ```ts
  // src/lib/env.ts (before)
  export function useOpenRouterProxy(): boolean {
    return process.env.NEXT_PUBLIC_USE_OR_PROXY === 'true';
  }

  // src/lib/config.ts (after)
  export function isOpenRouterProxyEnabled(): boolean {
    return process.env.NEXT_PUBLIC_USE_OR_PROXY === 'true';
  }
  ```

- Centralize ZDR enforcement:

  ```ts
  // src/lib/zdr.ts
  export async function enforceZdrModelSelection(modelId: string, cache: ZdrCache) {
    const ids = cache.modelIds ?? (cache.modelIds = await fetchZdrModelIds());
    if (ids.size > 0) return ids.has(modelId);
    const providers = cache.providers ?? (cache.providers = await fetchZdrProviderIds());
    return providers.has(modelId.split('/')[0]);
  }
  ```

- Extract attachment processing:

  ```ts
  // src/lib/agent/attachments.ts
  export async function toDataUrl(file: File): Promise<string> {
    /* ... */
  }
  export function toAudioBlock(fileOrDataUrl: { dataURL?: string; name?: string; mime?: string }) {
    // derive base64 + format
  }
  ```

- Edge/server auth split:

  ```ts
  // src/lib/auth/shared.ts
  export const AUTH_COOKIE_NAME = 'dlg_access';
  export const base64url = (buf: Uint8Array) => /* ... */;

  // middleware.ts
  import { AUTH_COOKIE_NAME } from '@/lib/auth/shared';
  ```

---

## Rollout Plan (Incremental)

1. Environment and auth constants

- Add `config.ts`, `auth/shared.ts`, and rename `useOpenRouterProxy` → `isOpenRouterProxyEnabled`.
- Confirm ZDR default OFF (no code change needed) and fix `/public` prefix in middleware; update docs.

2. API wrapper

- Introduce `api/orClient.ts` and switch `openrouter.ts`/server routes incrementally.

3. ZDR centralization

- Add `zdr.ts` and replace scattered enforcement in send/compare/model slices.

4. Message slice decomposition

- Extract attachments/tool/streaming helpers; keep store interface stable.

5. Component splits

- Split `Composer`, `MessageList`, and `TopHeader` sub‑components.

6. Tests

- Add unit tests for env, auth parity, ZDR, tool JSON stripping, tutor memory, model capabilities.

7. Docs + cleanup

- Update README/.env.example; remove dead `src/data/presets.ts` if unused.

This plan keeps behavior intact while making the codebase simpler, more modular, and easier to test and evolve.
