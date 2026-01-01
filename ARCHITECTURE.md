# Dialogia Architecture

Dialogia layers the product into UI, state, agent orchestration, transport, and persistence. The
goals are predictable data flow, a single source of truth for network boundaries, and well-isolated
business logic that is easy to test.

## Architecture Quickstart

- Golden path guide: `docs/GOLDEN_PATH.md` for common extension workflows.
- Key entrypoints: `src/lib/store/index.ts` (state composition), `src/lib/services/turns.ts`
  (send/regenerate flow), `src/lib/agent/compose.ts` (message assembly), and
  `src/lib/agent/orchestrator/turn.ts` (turn runner).
- Transport lives in `src/lib/openrouter/*` and `src/lib/transport/*` with shared HTTP helpers in
  `src/lib/api/*`; API routes live under `app/api/*`.

## Refactor Invariants

- ESLint enforces layer boundaries via `no-restricted-imports` in `eslint.config.js`:
  - DB (`src/lib/db/**`) cannot import agent/store/components.
  - Agent (`src/lib/agent/**`) cannot import UI components.
  - UI components (`src/components/**`) cannot import transport clients (`src/lib/api/*`,
    `src/lib/openrouter`).

## Layered Modules

- **UI** — React components in `app/` (routes, layouts) and `src/components/*` (PascalCase modules).
  Shared UI-only hooks and helpers live in `src/lib/ui/*` and `src/lib/hooks/*` so desktop and mobile
  variants reuse the same behavior.
- **State** — Zustand slices in `src/lib/store/*`. Composition happens in `src/lib/store/index.ts`,
  which wires persistence, migrations, and selectors. Each slice owns a bounded feature area
  (models, chat history, UI flags, multi-model state, tutor context, etc.). Versioned persistence
  migrations live in `src/lib/store/migrations.ts`. Message ordering + lookup is backed by
  `messageIdsByChatId`/`messagesById` with helpers in `src/lib/messages/indexing.ts`.
- **Agent** — Request builders, planning, tools, and policies in `src/lib/agent/*`. `compose.ts` is
  the single entry for per-turn system/message assembly. Planning is split across
  `src/lib/agent/planning/*`, streaming logic lives in `src/lib/agent/streaming.ts`, and heuristics
  live in `src/lib/agent/streaming/*`. `regenerate.ts` isolates regen logic so services stay thin.
  `src/lib/agent/orchestrator/*` hosts the turn runner and lifecycle management. DeepResearch
  orchestration lives in `src/lib/agent/deepResearchOrchestrator.ts`, backed by
  `src/lib/deepResearch/index.ts` + submodules for prompt, tools, and HTML parsing.
- **Services** — Cross-cutting orchestrators in `src/lib/services/*` that connect the store to the
  agent layer. `services/turns.ts` owns send/regenerate flows, with shared helpers in
  `src/lib/services/turns/*` and controller lifecycles isolated in `src/lib/services/controllers.ts`.
  Services prepare context and hand off to the agent orchestrator.
- **Transport** — Provider adapters in `src/lib/openrouter/*`, shared contracts in
  `src/lib/transport/*`, and HTTP utilities in `src/lib/api/*`. OpenRouter-specific request building
  lives in `src/lib/openrouter/request.ts`, while `src/lib/openrouter/http.ts` handles the raw HTTP
  calls. Shared helpers in `src/lib/api/config.ts`, `src/lib/api/stream.ts`, and
  `src/lib/api/errors.ts` encapsulate defaults, SSE parsing, and typed error construction.
  - ZDR cache helpers and enforcement live under `src/lib/policy/zdr/*`, with
    `src/lib/policy/zdr/index.ts` re-exporting helpers (`computeZdrFilter`,
    `computeZdrFilterCached`, `guardZdrOrNotifyCached`) so services can rely on a single façade.
- **External APIs** — OpenRouter proxy routes in `app/api/openrouter/*`, Brave search proxy in
  `app/api/brave/route.ts`, X.AI voice session in
  `app/api/xai/session/route.ts`, DeepResearch in `app/api/deep-research/route.ts`, and auth routes
  in `app/api/auth/*`. These never import UI modules.

## Public Module Surfaces

| Area                 | Import from                     | Notes                                                                 |
| -------------------- | ------------------------------- | --------------------------------------------------------------------- |
| Store entrypoints    | `src/lib/store/index.ts`        | Zustand store composition + `useChatStore`.                           |
| Message helpers      | `src/lib/messages/indexing.ts`  | O(1) message lookup/update helpers.                                   |
| Tutor domain         | `src/lib/tutor/index.ts`        | Profile, context, defaults, deck.                                     |
| DeepResearch         | `src/lib/deepResearch/index.ts` | Facade for prompt/engine/tools.                                       |
| OpenRouter transport | `src/lib/openrouter/index.ts`   | Transport client; request builder in `src/lib/openrouter/request.ts`. |
| Schemas              | `src/lib/schemas/*`             | Zod schemas + JSON schema builder.                                    |

## Module Boundaries

- UI may import store selectors/actions and `src/lib/ui/*` helpers, but never transport clients
  (`src/lib/api/*`, `src/lib/openrouter/*`).
- Agent modules never import UI components, and persistence (`src/lib/db/*`) never imports agent or
  store types.
- API routes under `app/api/*` must remain server-only and never import UI modules or components.
- These boundaries are enforced via ESLint `no-restricted-imports` in `eslint.config.js`.

```
            ┌──────────┐
            │   UI     │   app/*, src/components/*
            └────┬─────┘
                 │
            ┌────▼─────┐
            │  Store   │   src/lib/store/*
            └────┬─────┘
                 │ selectors/actions
            ┌────▼─────┐
            │  Agent   │   src/lib/agent/*
            └────┬─────┘
                 │ orchestrates
            ┌────▼─────┐
            │ Services │   src/lib/services/*
            └────┬─────┘
                 │ dispatches
            ┌────▼─────┐
            │Transport │   src/lib/api/*, src/lib/openrouter/*
            └────┬─────┘
                 │ HTTP
            ┌────▼─────┐
            │ External │   app/api/*
            └──────────┘
```

## Data Flow: Sending a Message

1. A composer component in `src/components/chat` dispatches a store action (e.g.,
   `useMessageStore.getState().sendDraft()`). UI-only effects (shortcuts, resize) run through local
   hooks to keep the component tree declarative.
2. The action invokes `src/lib/services/turns.ts`, which prepares chat/tutor state, manages
   controllers, and hands off to `src/lib/agent/orchestrator/turn.ts` (planning and streaming).
3. Agent helpers in `src/lib/agent/compose.ts`, `src/lib/agent/request.ts`, and
   `src/lib/agent/policy.ts` determine planning rounds and tool eligibility (search, tutor), while
   provider adapters (e.g., `src/lib/openrouter/request.ts`) build provider-specific payloads.
4. The pipeline client (`src/lib/agent/pipelineClient.ts`) selects the transport implementation
   (`src/lib/openrouter/index.ts`, etc.) and underlying HTTP client. Proxying through
   `/api/openrouter/*` keeps provider keys off the client whenever proxy mode is enabled.
5. Streaming responses feed `src/lib/agent/streamHandlers.ts`, which mutate store slices via
   dedicated update helpers (append tokens, metrics, annotations). Non-streaming responses update
   message state in one shot.
6. The UI reacts via selectors (`useChatMessages`, `useModelStore`) and rerenders declaratively. The
   persisted portions of the store sync to IndexedDB through Zustand persistence adapters.

## Rationale

- UI components are thin and declarative; business logic resides in the agent/service layers.
- Transport code is centralized to simplify retries, headers, and streaming. This keeps the rest of
  the app unaware of fetch details.
- Typed slices and pipeline DTOs ensure UI, agent, and services agree on a single contract.
- IndexedDB (Dexie) manages long-lived chat history, while the persisted slice tracks session-level
  preferences. Ephemeral controllers stay outside persistence to avoid corrupting restores. A
  versioned upgrade hook in `src/lib/db/dexie.ts` sanitizes historical messages via
  `src/lib/db/sanitize.ts` so newer features do not have to guard every field.

## Extending Providers or Tools

1. Add provider metadata to `src/data/curatedModels.ts` and update `src/lib/models.ts` if new
   capability flags are required (e.g., vision, audio).
2. Implement transport changes in `src/lib/openrouter/*` or a new transport module so all callers
   inherit the contract. Request payload tweaks should flow through provider adapters (e.g.,
   `src/lib/openrouter/request.ts`), while shared contracts live in `src/lib/transport/*`.
3. Define tool schemas under `src/lib/agent/searchFlow.ts` (or a new module) and surface helpers
   from the agent layer—never from UI components.
4. Register tool parsing or execution in `src/lib/agent/planning.ts` / `streaming.ts` and keep
   side-effects (store writes, notices) funneled through services.
5. Update `CONFIGURATION.md` with any new environment variables and document proxy requirements.

## Glossary

- **Chat settings** — persisted per-chat preferences in `Chat.settings` (model, search, reasoning).
- **Generation settings** — per-turn resolved settings derived from chat settings, UI overrides, and
  model caps (`ResolvedTurnSettings.generation`).
- **UI overrides** — one-turn intent stored in `ui.overrides` and cleared after the next turn runs.
- **Tutor tools** — pedagogy-focused tools in `src/lib/agent/tools/tutor/*` (diagnostics, plans).
- **Search tools** — web retrieval tools (`src/lib/agent/tools/web.ts`) that augment context.
- **DeepResearch** — extended research flow with trace data and specialized orchestration
  (`src/lib/agent/deepResearchOrchestrator.ts`).
