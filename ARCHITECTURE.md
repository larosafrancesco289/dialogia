# Dialogia Architecture

Dialogia layers the product into UI, state, agent orchestration, transport, and persistence. The
goals are predictable data flow, a single source of truth for network boundaries, and well-isolated
business logic that is easy to test.

## Layered Modules

- **UI** — React components in `app/` (routes, layouts) and `src/components/*` (PascalCase modules).
  Hooks and presentational helpers that only touch the DOM live next to the component that uses
  them (for example `src/components/chat/hooks/useComposerShortcuts.ts`).
- **State** — Zustand slices in `src/lib/store/*`. Composition happens in `src/lib/store.ts`, which
  wires persistence, migrations, and selectors. Each slice owns a bounded feature area (models,
  chat history, UI flags, compare drawer, tutor context, etc.).
- **Agent** — Request builders, planning, tools, and policies in `src/lib/agent/*`. The
  `compose.ts` module is the single entry for per-turn system/message assembly so every consumer
  (send, regenerate, tests) shares the exact same preamble logic. These modules coordinate message
  planning, tool invocation, tutor flows, and research orchestration without touching transport
  concerns directly.
  - `request.ts` centralizes provider routing and the `composePlugins` helper. The PDF parser plugin
    is only attached when uploads are present, and the OpenRouter web plugin is enabled when the UI
    requests OpenRouter-backed search. Keeping this logic in one place avoids divergent payloads.
- **Services** — Cross-cutting orchestrators in `src/lib/services/*` that connect the store to the
  agent layer. `services/turns.ts` owns send/regenerate flows, while `services/controllers.ts`
  isolates AbortController lifecycles outside persistence. `messagePipeline.ts` remains the entry
  point for the streaming lifecycle.
- **Transport** — HTTP clients in `src/lib/api/*` and protocol adapters such as
  `src/lib/openrouter.ts`. Shared helpers in `src/lib/api/stream.ts` and `src/lib/api/errors.ts`
  encapsulate SSE parsing and typed error construction so retry logic stays consistent.
- **External APIs** — OpenRouter proxy routes in `app/api/openrouter/*`, Brave search proxy in
  `app/api/brave/route.ts`, and any additional integrations. These never import UI modules.

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
            │Transport │   src/lib/api/*, src/lib/openrouter.ts
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
   controllers, and delegates to the agent pipeline. Streaming orchestration continues through
   `src/lib/services/messagePipeline.ts`.
3. Agent helpers in `src/lib/agent/compose.ts`, `src/lib/agent/request.ts`, and
   `src/lib/agent/policy.ts` determine planning rounds, tool eligibility (search, tutor), and build
   the OpenRouter payload.
4. The transport function `src/lib/openrouter.ts` uses the consolidated client in
   `src/lib/api/openrouterClient.ts` to perform the HTTP request (streaming or non-streaming).
   Proxying through `/api/openrouter/*` keeps provider keys off the client.
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
  versioned upgrade hook in `src/lib/db.ts` sanitizes historical messages (trimmed tutor context,
  filtered attachments) so newer features do not have to guard every field.

## Extending Providers or Tools

1. Add provider metadata to `src/data/curatedModels.ts` and update `src/lib/models.ts` if new
   capability flags are required (e.g., vision, audio).
2. Implement transport changes in `src/lib/openrouter.ts` (or a new client module) so all callers
   inherit the contract. Request payload tweaks should flow through `src/lib/agent/request.ts`.
3. Define tool schemas under `src/lib/agent/searchFlow.ts` (or a new module) and surface helpers
   from the agent layer—never from UI components.
4. Register tool parsing or execution in `src/lib/services/messagePipeline.ts` and keep side-effects
   (store writes, notices) funneled through services.
5. Update `CONFIGURATION.md` with any new environment variables and document proxy requirements.
