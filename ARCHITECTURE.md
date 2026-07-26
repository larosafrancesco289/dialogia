# Architecture

Dialogia is a static single-page app. There is no server in the default build: the browser holds
the chat history, the provider keys, and every decision about where a request goes. A second,
optional build puts a Cloudflare worker in front of the same assets for a hosted deployment.

This document describes how the client is put together and which boundaries are load-bearing. For
setup and deployment see [README.md](README.md); for how to work in the repo see
[CONTRIBUTING.md](CONTRIBUTING.md).

## The shape of it

```
index.html ──▶ src/main.tsx ──▶ src/router.tsx ──▶ HomeClient / MobileShell
                                       │
                                       ▼
     ┌─────────────────────────────────────────────────────────────┐
     │  src/components/**     React tree; reads the store only     │
     ├─────────────────────────────────────────────────────────────┤
     │  src/lib/store/**      Zustand slices + persistence         │
     ├─────────────────────────────────────────────────────────────┤
     │  src/lib/services/**   Turn lifecycle, bootstrap, titles    │
     ├─────────────────────────────────────────────────────────────┤
     │  src/lib/agent/**      Compose, plan, stream, tools         │
     ├─────────────────────────────────────────────────────────────┤
     │  src/lib/transport/**  Endpoints, auth, provider clients    │
     └─────────────────────────────────────────────────────────────┘
                    │                              │
                    ▼                              ▼
        src/lib/db/**  (IndexedDB)      provider API, or /api/* proxy
        src/lib/keys/** (IndexedDB)
```

Two things sit beside that stack rather than inside it:

- `src/modules/` — removable feature modules. Today there is one, `tutor`. Core reaches a module
  only through `src/lib/modules.ts`.
- `functions/` — the hosted variant's Cloudflare worker. Absent from the default build.

## Enforced boundaries

ESLint's `no-restricted-imports` / `no-restricted-syntax` rules in `eslint.config.js` are the real
specification; this list is the summary. A violation fails `bun run lint` even when types pass.

| Layer                                           | Must not import                                       |
| ----------------------------------------------- | ----------------------------------------------------- |
| `src/lib/db/**`                                 | agent, store, components                              |
| `src/lib/agent/**`                              | UI components, `src/lib/services/**`                  |
| `src/lib/transport/**`, `src/lib/openrouter/**` | `src/lib/agent/**`                                    |
| `src/components/**`                             | transport clients, server-only modules, `rehype-raw`  |
| core tool plumbing                              | any feature module                                    |
| everything outside `src/lib/modules.ts`         | `@/modules/*`, statically, dynamically, or relatively |

Two consequences worth knowing in advance:

- A helper both the agent and the services need belongs in a layer both may import. User-facing
  notice text lives in `src/lib/store/notices.ts` for exactly this reason.
- The `rehype-raw` ban is a security control, not a style preference. Model output is untrusted and
  BYOK keys live in the same origin, so the markdown pipeline must never render raw HTML.

## State

The store is one Zustand store composed from slices in `src/lib/store/createStore.ts`:

```ts
buildStoreInitializer(modules = ENABLED_MODULES): StoreInitializer;
```

`src/lib/store/index.ts` wraps it in `persist` and does nothing else. Every consumer that needs a
store — the app, the tests, the headless tutor runner — builds from `buildStoreInitializer()`, so
adding a field or an action means editing exactly one slice file. There are no mirrors.

Core slices: `chatSlice`, `messageSlice`, `modelSlice`, `uiSlice`, `endpointSlice`. Modules
contribute their own through `AppModule.storeSlice`, and augment `ModuleStoreActions` by
declaration merging so their actions are typed on the composed store.

### Messages are indexed, and hydrated lazily

Messages live in `messagesById` plus `messageIdsByChatId`. Always go through the helpers in
`src/lib/messages/indexing.ts`; nothing should touch those maps directly.

**Startup loads only the selected chat's messages.** Other chats hydrate on selection through
`ensureChatMessagesLoaded`, or during browser idle as a prefetch. `loadedMessageChatIds` and
`nonEmptyChatIds` track what is in memory, and both are ephemeral. Anything that needs every
message — usage statistics, for instance — must call `ensureAllChatMessagesLoaded` first. Export
and import read the database directly and are unaffected.

### What gets persisted, and where

Three separate stores, deliberately:

| Data                                 | Where                         | Versioned by              |
| ------------------------------------ | ----------------------------- | ------------------------- |
| Chats, messages, folders, KV records | IndexedDB `dialogia` (Dexie)  | `DB_SCHEMA_VERSION`       |
| UI preferences, endpoint configs     | `localStorage['dialogia-ui']` | `STORE_MIGRATION_VERSION` |
| Provider and search API keys         | IndexedDB `dialogia-keys`     | its own Dexie version     |

Keys live in a database of their own so that `exportAll`/`importAll` — which walk the `dialogia`
database — cannot reach them even by accident. "Keys are never exported" is structural rather than
a rule someone has to remember.

Persisted UI state is composed, not enumerated. Each slice and each module exports a
`PersistFragment` with `partialize` and an optional `merge`; `src/lib/store/persistence.ts` folds
them together. A fragment's `merge` sees the untouched current state, because the blind key spread
above it has already replaced its key with the persisted partial. Migrations stay central in
`src/lib/store/migrations.ts`, since they operate on raw JSON that may name removed fields.

**Persisted key names are a compatibility surface.** `tests/persistedStoreCompat.test.ts` round-trips
a pre-refactor blob through migrate → merge → partialize and asserts the exact key set.

## A turn, end to end

1. The composer dispatches a store action. `messageSlice` loads `@/lib/services/turns` through a
   dynamic import at the call site — the turn pipeline must not be in the boot bundle.
2. `services/turns.ts` spawns the user and assistant messages, resolves auth, checks the ZDR gate,
   and hands off to `src/lib/agent/orchestrator/turn.ts`.
3. `agent/compose.ts` assembles the request: system preambles, message history, tool definitions.
   Enabled modules contribute tools and preambles through `ModuleRuntime.compose`, and may set
   `requiresPlanning` to demand the multi-round planning loop.
4. `settings/resolve.ts` produces `ResolvedTurnSettings` — the model, the clamped reasoning effort,
   and the effective search mode. Everything downstream reads the resolved values, never the raw
   chat settings.
5. `agent/pipelineClient.ts` picks the transport client for the call's endpoint and builds the
   provider body.
6. Streaming responses feed `agent/streamHandlers.ts`, which updates the store and checkpoints the
   partial assistant message to IndexedDB.

### Two invariants in the streaming path

**Token flushes are batched.** `src/lib/agent/streaming/accumulator.ts` coalesces tokens on roughly
a 32 ms cadence. Rendering per token instead would be visibly worse on long replies.

**The partial message is checkpointed to IndexedDB during the stream.** A crash or a reload mid-reply
must not lose the text already on screen.

Preserve both when touching this path.

During streaming the UI renders through `StreamingMarkdown`, which memoizes completed blocks
(`src/lib/markdown/blocks.ts`) and re-parses only the growing tail. Never render the full document
per flush. The `streaming` prop on `Markdown` gates Prism caching, Mermaid rendering and image zoom;
thread it through any embedded renderer you add.

## Providers and keys

A call is described by a `ProviderEndpoint` (`src/lib/transport/endpoints.ts`), not by a closed
provider union:

```ts
type TransportKind = 'openrouter' | 'anthropic' | 'openai-compatible';

type ProviderEndpoint = {
  id: string;
  kind: TransportKind;
  label: string;
  baseUrl?: string; // required for openai-compatible
  apiKeyRef?: string; // a reference into the key store, never a key
  useProxy?: boolean; // hosted build only
  capabilities?: EndpointCapabilities;
  modelIds?: string[];
  titleModelId?: string;
  disableTitleGeneration?: boolean;
};
```

The set of transport _implementations_ is closed — three clients in
`src/lib/transport/registry.ts`. The set of _endpoints_ is open: OpenRouter and Anthropic are
frozen built-ins, and the user adds OpenAI-compatible endpoints (Ollama, LM Studio, llama.cpp,
vLLM) as configuration.

Endpoint configuration is owned by `endpointSlice`, but auth resolution and body building are
synchronous and sit below the store, so the slice republishes into
`src/lib/transport/endpointRegistry.ts` on every mutation and on the persist merge. Read endpoints
from the registry, not from the raw constants: the registry is what carries the deployment's proxy
configuration.

Three rules this design exists to enforce:

- **A user endpoint's capabilities are authoritative.** An unlisted capability is never emitted.
  Name-regex capability inference applies only to the metadata-rich built-ins. A strict server
  rejects a whole request over one unknown key, so silence beats optimism.
- **Model identity is `(endpointId, transportModelId)`.** User endpoint model ids are namespaced
  `endpoint:<slug>/<model>`. No upstream id has a colon in its first segment, which is what stops an
  endpoint slugged `openai` from shadowing OpenRouter's `openai/gpt-4o`.
- **A model scoped to a deleted endpoint fails closed.** `findModelEndpoint` is the non-throwing
  view for labels and body-shape decisions; `resolveModelEndpoint` is the request path and throws,
  because falling back to OpenRouter would ship a local-only history to a third party.

Keys are read synchronously from a cache in `src/lib/keys/store.ts` warmed by `loadKeys()`, which
both `bootstrapApp` and `loadModels` await so a slow IndexedDB read can never look like an
unconfigured app. **A key the user has pasted wins over the deployment's proxy.**

## Tools and search

The tool registry (`src/lib/tools/registry.ts`) is open and keyed by string. An entry is
`{ definition, metadata, handler? }`, and `metadata.kind` is what the scheduler reads:

- `action` — ordinary; any number may run per round (`web_search`, `web_fetch`).
- `content` — at most one per round.
- `meta` — always scheduled first.

Core owns the container and the kind vocabulary. A module owns its tools, registers them from its
turn half, and keeps its private metadata in `metadata.ext`, which only it may interpret. The
scheduler in `src/lib/agent/tools/scheduler.ts` knows about kinds, search dedupe and the
per-round search cap, and nothing else; priority among competing content tools is delegated to the
active module's `ToolGate`.

Web search is two distinct mechanisms, kept apart on purpose:

1. **Provider-native search** — OpenRouter's `web` plugin, which the Anthropic transport
   reinterprets as that API's own `web_search` server tool. It is a field of the model request,
   needs no extra key, and is the default.
2. **Tool-based search** — a real `web_search`/`web_fetch` tool call against a third-party API,
   described by the `SearchProvider` interface in `src/lib/search/providers/types.ts`. Tavily is the
   first implementation. `web_fetch` is offered to the model only when the active provider
   implements `fetchPage`.

`SearchMode` is an open string. A chat naming a provider this machine has no key for degrades to
native search rather than failing (`selectSearchMode`).

## Feature modules

`src/lib/modules.ts` is the single list of enabled modules and the only place core may reach into
one. Removing a feature is deleting its directory and its entry in that file.

A module has two halves:

- **Boot half** — `storeSlice`, `persistFragment`, `decorateMessage`, `settingsDefaults`, `panels`,
  `onBootstrap`. Statically imported.
- **Turn half** — `load()`, returning a `ModuleRuntime` with `registerTools`, `compose`, `planning`
  and `turnEffects`. Loaded on demand with the turn pipeline.

Two things must not be undone:

- **`AppModule.load` must stay a dynamic import.** It is what keeps a module's turn half out of the
  boot bundle; making it static cost 22 kB.
- **Module panels must stay `React.lazy`.** Panel components import the store, which imports
  `@/lib/modules`, so a static import there is an initialisation cycle, not merely a bundle
  regression.

UI mounts go through `ENABLED_MODULES[].panels` against typed slots resolved by
`src/components/ModuleSlot.tsx`. Module turn effects accumulate message fields that core applies as
one combined patch, so a module never has to care whether `onPlanResult` or `beforeStream` fires
first.

`src/lib/types/tutor.ts` and `src/lib/types/learningPlan.ts` stay in core by design: core declares
the shapes it persists through the optional `Message.tutor` and `ChatSettings.features.tutor`
fields, and the module owns all behaviour.

## The hosted variant

`functions/` builds separately, through `vite.worker.config.ts`, into `dist/_worker.js`. It exists
only in `bun run build:hosted`.

- `worker.ts` — entry. Binds the Cloudflare environment into `@/lib/env/source` once per request,
  then dispatches.
- `middleware.ts` — the access gate. Validates a signed HttpOnly cookie and redirects to `/access`.
- `routes.ts` — the path table.
- `api/*` — one module per endpoint: OpenRouter and Anthropic proxies, the ZDR endpoint list, the
  Tavily proxy, and the auth routes.

It is a Cloudflare Pages **advanced-mode** worker rather than Pages-routed functions, because Pages
compiles `functions/` with esbuild and does not resolve the `tsconfig` path aliases the whole
`@/lib/**` graph behind those routes uses. Advanced mode also bypasses `_redirects`, so the worker
performs the SPA fallback itself; `public/_redirects` still covers the static build.

**The proxies build their auth from the server environment and never read an inbound `Authorization`
or `x-api-key`.** They inject only the deployment's own key, behind the gate and the rate limiter,
which is what keeps the proxy from becoming an open relay. `src/lib/openrouter/http.test.ts` and
`src/lib/anthropic/http.test.ts` assert that a proxied call carries no client credentials in either
direction.

Server config is read per request through `src/lib/env/source.ts`, because Cloudflare hands the
environment to the worker rather than exposing `process.env`. Node (tests, CLI) falls through to
`process.env`. Note the distinction between `isProd()` — the client's notion, from
`import.meta.env.MODE` — and `isServerProd()`, which reads the bound environment. **An absent
`NODE_ENV` is read as production**, because Cloudflare does not set it and the old default would
have disabled the access gate on a live deployment.

## Threat model, briefly

A browser-held key is readable by the page holding it. That is inherent to BYOK, and no storage
choice changes it. What keeps the door closed:

- `rehype-raw` is absent and lint-banned, so react-markdown escapes raw HTML in model output.
- `dangerouslySetInnerHTML` appears once, in the code-block renderer, fed by `Prism.highlight` or a
  local `escapeHtml` fallback.
- Mermaid runs with `securityLevel: 'strict'`.
- Link hrefs pass through react-markdown's default `urlTransform`, which strips dangerous
  protocols. This matters because citation markers inject search-result URLs, which are
  attacker-influenced.
- `sanitizeEndpoint` always derives `apiKeyRef` from the endpoint id and ignores the persisted blob,
  so an imported backup cannot point a hostile base URL at a built-in endpoint's key.

## Where things live

| Concern                  | Path                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------- |
| SPA shell, routes        | `index.html`, `src/main.tsx`, `src/router.tsx`                                              |
| React tree               | `src/components/**`                                                                         |
| Store and persistence    | `src/lib/store/**`                                                                          |
| Turn lifecycle           | `src/lib/services/**`, `src/lib/turns/**`                                                   |
| Compose / plan / stream  | `src/lib/agent/**`                                                                          |
| Tools                    | `src/lib/tools/**`                                                                          |
| Search                   | `src/lib/search/**`                                                                         |
| Endpoints, auth, clients | `src/lib/transport/**`, `src/lib/{openrouter,anthropic,openaiCompat}/**`, `src/lib/auth/**` |
| Keys                     | `src/lib/keys/store.ts`                                                                     |
| Chat persistence         | `src/lib/db/**`                                                                             |
| Feature modules          | `src/modules/**`, listed in `src/lib/modules.ts`                                            |
| Hosted worker            | `functions/**`                                                                              |
| Styles and tokens        | `styles/**`                                                                                 |
