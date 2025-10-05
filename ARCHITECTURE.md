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
- **Agent** — Request builders, planning, tools, and policies in `src/lib/agent/*`. These modules
  coordinate message planning, tool invocation, tutor flows, and research orchestration without
  touching transport concerns directly.
- **Services** — Cross-cutting orchestrators in `src/lib/services/*` that connect the store to the
  agent layer. `messagePipeline.ts` is the entry point for send/stream lifecycles.
- **Transport** — HTTP clients in `src/lib/api/*` and protocol adapters such as
  `src/lib/openrouter.ts`. They hide headers, retries, streaming surface area, and origin handling.
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
2. The action invokes the pipeline entry point in `src/lib/services/messagePipeline.ts`. The service
   reads the latest slices, prepares metadata, and hands control to the agent layer.
3. Agent helpers in `src/lib/agent/request.ts` and `src/lib/agent/policy.ts` determine planning
   rounds, tool eligibility (search, tutor), and build the OpenRouter payload.
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
  preferences. Ephemeral controllers stay outside persistence to avoid corrupting restores.
