# Architecture

Dialogia is a static single-page app (SPA). There is no server. The browser holds the chat
history, the provider keys, and every decision about where a request goes, and every model call
goes from the page to the provider the user holds a key for.

This document describes how the client is put together and which boundaries are load-bearing. For
setup and deployment see [README.md](README.md). For how to work in the repo see
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
        src/lib/db/**  (IndexedDB)      provider API
        src/lib/keys/** (IndexedDB)
```

One thing sits beside that stack rather than inside it. `src/modules/` holds removable feature
modules. Today there is one, `tutor`. Core reaches a module only through `src/lib/modules.ts`.

## Enforced boundaries

ESLint's `no-restricted-imports` and `no-restricted-syntax` rules in `eslint.config.js` are the real
specification, and this list is the summary. A violation fails `bun run lint` even when types pass.

| Layer                                           | Must not import                                       |
| ----------------------------------------------- | ----------------------------------------------------- |
| `src/lib/db/**`                                 | agent, store, components                              |
| `src/lib/agent/**`                              | UI components, `src/lib/services/**`                  |
| `src/lib/transport/**`, `src/lib/openrouter/**` | `src/lib/agent/**`                                    |
| `src/components/**`                             | transport clients, `rehype-raw`                       |
| core tool plumbing                              | any feature module                                    |
| everything outside `src/lib/modules.ts`         | `@/modules/*`, statically, dynamically, or relatively |

Two consequences are worth knowing in advance.

- A helper both the agent and the services need belongs in a layer both may import. User-facing
  notice text lives in `src/lib/store/notices.ts` for exactly this reason.
- The `rehype-raw` ban is a security control. Model output is untrusted and a user's own provider
  keys live in the same origin, so the markdown pipeline must never render raw HTML.

## State

The store is one Zustand store composed from slices in `src/lib/store/createStore.ts`.

```ts
buildStoreInitializer(modules = ENABLED_MODULES): StoreInitializer;
```

`src/lib/store/index.ts` wraps it in `persist` and does nothing else. Every consumer that needs a
store builds from `buildStoreInitializer()`, and that includes the app, the tests and the headless
tutor runner. Adding a field or an action means editing exactly one slice file. There are no
mirrors.

The core slices are `chatSlice`, `messageSlice`, `modelSlice`, `uiSlice` and `endpointSlice`.
Modules contribute their own through `AppModule.storeSlice`, and augment `ModuleStoreActions` by
declaration merging so their actions are typed on the composed store.

### Messages are indexed, and hydrated lazily

Messages live in `messagesById` plus `messageIdsByChatId`. Always go through the helpers in
`src/lib/messages/indexing.ts`. Nothing should touch those maps directly.

**Startup loads only the selected chat's messages.** Other chats hydrate on selection through
`ensureChatMessagesLoaded`, or during browser idle as a prefetch. `loadedMessageChatIds` and
`nonEmptyChatIds` track what is in memory, and both are ephemeral. Anything that needs every
message, usage statistics for instance, must call `ensureAllChatMessagesLoaded` first. Export and
import read the database directly and are unaffected.

### What gets persisted, and where

There are three separate stores, deliberately.

| Data                                 | Where                         | Versioned by              |
| ------------------------------------ | ----------------------------- | ------------------------- |
| Chats, messages, folders, KV records | IndexedDB `dialogia` (Dexie)  | `DB_SCHEMA_VERSION`       |
| UI preferences, endpoint configs     | `localStorage['dialogia-ui']` | `STORE_MIGRATION_VERSION` |
| Provider and search API keys         | IndexedDB `dialogia-keys`     | its own Dexie version     |

Keys live in a database of their own so that `exportAll`/`importAll`, which walk the `dialogia`
database, cannot reach them even by accident. "Keys are never exported" is structural rather than a
rule someone has to remember.

Persisted UI state is composed rather than enumerated. Each slice and each module exports a
`PersistFragment` with `partialize` and an optional `merge`, and `src/lib/store/persistence.ts`
folds them together. A fragment's `merge` sees the untouched current state, because the blind key
spread above it has already replaced its key with the persisted partial. Migrations stay central in
`src/lib/store/migrations.ts`, since they operate on raw JSON that may name removed fields.

**Persisted key names are a compatibility surface.** `tests/persistedStoreCompat.test.ts` round-trips
a pre-refactor blob through migrate → merge → partialize and asserts the exact key set.

## A turn, end to end

1. The composer dispatches a store action. `messageSlice` loads `@/lib/services/turns` through a
   dynamic import at the call site, because the turn pipeline must not be in the boot bundle.
2. `src/lib/services/turns.ts` spawns the user and assistant messages, resolves auth, checks the
   Zero-Data-Retention (ZDR) gate, and hands off to `src/lib/agent/orchestrator/turn.ts`.
3. `src/lib/agent/compose.ts` assembles the request, which means system preambles, message history
   and tool definitions. Enabled modules contribute tools and preambles through
   `ModuleRuntime.compose`, and may set `requiresPlanning` to demand the multi-round planning loop.
4. `src/lib/settings/resolve.ts` produces `ResolvedTurnSettings`, which carries the model, the
   clamped reasoning effort, and the effective search mode. Everything downstream reads the
   resolved values, never the raw chat settings.
5. `src/lib/agent/pipelineClient.ts` picks the transport client for the call's endpoint and builds
   the provider body.
6. Streaming responses feed `src/lib/agent/streamHandlers.ts`, which updates the store and
   checkpoints the partial assistant message to IndexedDB.

### Two invariants in the streaming path

**Token flushes are batched.** `src/lib/agent/streaming/accumulator.ts` coalesces tokens on a 32 ms
cadence, the value of `flushIntervalMs` in that file. Rendering per token instead would be visibly
worse on long replies.

**The partial message is checkpointed to IndexedDB during the stream.** A crash or a reload mid-reply
must not lose the text already on screen.

Preserve both when touching this path.

During streaming the UI renders through `StreamingMarkdown`, which memoizes completed blocks
(`src/lib/markdown/blocks.ts`) and re-parses only the growing tail. Never render the full document
per flush. The `streaming` prop on `Markdown` gates Prism caching, Mermaid rendering and image zoom.
Thread it through any embedded renderer you add.

## Providers and keys

A call is described by a `ProviderEndpoint` (`src/lib/transport/endpoints.ts`) rather than by a
closed provider union.

```ts
type TransportKind = 'openrouter' | 'anthropic' | 'openai-compatible';

type ProviderEndpoint = {
  id: string;
  kind: TransportKind;
  label: string;
  baseUrl?: string; // required for openai-compatible
  apiKeyRef?: string; // a reference into the key store, never a key
  capabilities?: EndpointCapabilities;
  modelIds?: string[];
  titleModelId?: string;
  disableTitleGeneration?: boolean;
};
```

The set of transport _implementations_ is closed, and holds three clients in
`src/lib/transport/registry.ts`. The set of _endpoints_ is open. OpenRouter and Anthropic are frozen
built-ins, and the user adds OpenAI-compatible endpoints (Ollama, LM Studio, llama.cpp, vLLM) as
configuration.

Endpoint configuration is owned by `endpointSlice`, but auth resolution and body building are
synchronous and sit below the store. So the slice republishes into
`src/lib/transport/endpointRegistry.ts` on every mutation and on the persist merge. Read endpoints
from the registry rather than from the raw constants, because the registry is what carries the
user's own endpoints.

This design exists to enforce three rules.

- **A user endpoint's capabilities are authoritative.** An unlisted capability is never emitted.
  Name-regex capability inference applies only to the metadata-rich built-ins. A strict server
  rejects a whole request over one unknown key, so silence beats optimism. The user does not have
  to guess, though: `src/lib/openaiCompat/probe.ts` sends one tiny request per capability, each
  carrying exactly the field that capability gates, and the Providers panel offers to copy the
  verdicts into the toggles.
- **Model identity is `(endpointId, transportModelId)`.** User endpoint model ids are namespaced
  `endpoint:<slug>/<model>`. No upstream id has a colon in its first segment, which is what stops an
  endpoint slugged `openai` from shadowing OpenRouter's `openai/gpt-4o`.
- **A model scoped to a deleted endpoint fails closed.** `findModelEndpoint` is the non-throwing
  view for labels and body-shape decisions. `resolveModelEndpoint` is the request path and throws,
  because falling back to OpenRouter would ship a local-only history to a third party.

Keys are read synchronously from a cache in `src/lib/keys/store.ts` warmed by `loadKeys()`, which
both `bootstrapApp` and `loadModels` await so a slow IndexedDB read can never look like an
unconfigured app.

## Tools and search

The tool registry (`src/lib/tools/registry.ts`) is open and keyed by string. An entry is
`{ definition, metadata, handler? }`, and `metadata.kind` is what the scheduler reads.

- `action` is ordinary. Any number may run per round (`web_search`, `web_fetch`).
- `content` runs at most once per round.
- `meta` is always scheduled first.

Core owns the container and the kind vocabulary. A module owns its tools, registers them from its
turn half, and keeps its private metadata in `metadata.ext`, which only it may interpret. The
scheduler in `src/lib/agent/tools/scheduler.ts` knows about kinds, search dedupe and the per-round
search cap, and nothing else. Priority among competing content tools is delegated to the active
module's `ToolGate`.

Web search is two distinct mechanisms, kept apart on purpose.

1. **Provider-native search** is OpenRouter's `web` plugin, which the Anthropic transport
   reinterprets as that API's own `web_search` server tool. It is a field of the model request,
   needs no extra key, and is the default.
2. **Tool-based search** is a real `web_search`/`web_fetch` tool call against a third-party API,
   described by the `SearchProvider` interface in `src/lib/search/providers/types.ts`. Tavily is the
   first implementation. `web_fetch` is offered to the model only when the active provider
   implements `fetchPage`.

`SearchMode` is an open string. A chat naming a provider this machine has no key for degrades to
native search rather than failing (`selectSearchMode`).

## Feature modules

`src/lib/modules.ts` is the single list of enabled modules and the only place core may reach into
one. Removing a feature is deleting its directory and its entry in that file.

A module has two halves.

- **The boot half** is `storeSlice`, `persistFragment`, `decorateMessage`, `settingsDefaults`,
  `panels` and `onBootstrap`. It is statically imported.
- **The turn half** is `load()`, returning a `ModuleRuntime` with `registerTools`, `compose`,
  `planning` and `turnEffects`. It is loaded on demand with the turn pipeline.

Two things must not be undone.

- **`AppModule.load` must stay a dynamic import.** It is what keeps a module's turn half out of the
  boot bundle, and making it static puts that whole turn half back in.
- **Module panels must stay `React.lazy`.** Panel components import the store, which imports
  `@/lib/modules`, so a static import there creates an initialisation cycle. That is worse than a
  bundle regression.

UI mounts go through `ENABLED_MODULES[].panels` against typed slots resolved by
`src/components/ModuleSlot.tsx`. Module turn effects accumulate message fields that core applies as
one combined patch, so a module never has to care whether `onPlanResult` or `beforeStream` fires
first.

`src/lib/types/tutor.ts` and `src/lib/types/learningPlan.ts` stay in core by design. Core declares
the shapes it persists through the optional `Message.tutor` and `ChatSettings.features.tutor`
fields, and the module owns all behaviour.

## Deployment

`bun run build` emits `dist/`, a static site. There is no worker, no API route and no environment
the deployment has to carry, because every provider call leaves the visitor's browser with the
visitor's own key. `public/_redirects` gives Cloudflare Pages and Netlify the SPA fallback; other
hosts need the equivalent rule. `wrangler.toml` describes a Cloudflare Worker with no code of its
own that serves `dist/` as static assets, with the SPA fallback set there too.

Client config is `import.meta.env.VITE_*`, inlined at build time, and none of it may be a secret.
`isProd()` reads the build mode. The tutor simulation CLI is the one place a key comes from the
environment, and it runs in Node, never in the page.

## Threat model, briefly

A browser-held key is readable by the page holding it. That is inherent to bring your own key
(BYOK), and no storage choice changes it. These are the controls that keep the door closed.

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
| Styles and tokens        | `styles/**`                                                                                 |
