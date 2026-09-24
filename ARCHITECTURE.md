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

`src/lib/store/index.ts` wraps it in `persist`, connects it to the other tabs (see below) and
does nothing else. Every consumer that needs a store builds from `buildStoreInitializer()`, and
that includes the app, the tests and the headless tutor runner. Adding a field or an action means
editing exactly one slice file. There are no mirrors.

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
| Tutor event logs (`tutorEvents`)     | IndexedDB `dialogia` (Dexie)  | `DB_SCHEMA_VERSION`       |
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

### Tabs keep each other in step

Every tab has its own store over the one `dialogia` database. Preferences follow through the
`storage` event on `localStorage['dialogia-ui']` (`src/lib/store/index.ts`). Everything in IndexedDB
follows through a `BroadcastChannel` (`src/lib/sync/tabChannel.ts`, a no-op where there is none).

- **The repository announces.** `src/lib/db/announce.ts` wraps it, so each write is announced once
  it has landed: chat and folder rows by id, message rows by chat and id, deletions, a chat's tutor
  log, a backup import. Announcements carry ids, never content. A write that bypasses the
  repository is invisible to the other tabs.
- **The receiver reads back.** `src/lib/store/tabSync.ts` takes the rows from IndexedDB into the
  store. Messages go only into a chat whose messages are loaded; an unloaded chat just becomes
  non-empty, and lazy hydration loads it later. A deleted chat goes the way a local delete goes. A
  module re-reads its log through `onEventsChangedElsewhere`.
- **No echo.** What a tab adopts is set into the store and never written back, so nothing it hears
  is announced again. The only writes a received announcement can cause are this tab's own: the
  tutor's unsaved events, or the last checkpoint of a reply stopped because another tab deleted its
  chat.
- **Never under this tab's own reply.** Messages another tab saves in a chat where this tab is
  streaming wait until its turn ends. Otherwise the in-flight message could be replaced by an
  older copy from disk.
- **Replies in progress are announced too.** A tab says when it starts and stops writing a reply,
  with the reply ids. It repeats this every 15 s while the reply lasts, answers a newly opened
  tab, and says it has stopped on `pagehide`. The other tabs list those replies in
  `repliesInOtherTabs`. They render them as streaming, not with the "page closed" cut-off note
  their checkpoints carry on disk, and they refuse to start a turn in that chat. A turn started
  there would miss the reply, and the transcript would interleave two turns. A writing tab not
  heard from for 60 s is let go.

## A turn, end to end

1. The composer dispatches a store action. `messageSlice` loads `@/lib/services/turns` through a
   dynamic import at the call site, because the turn pipeline must not be in the boot bundle.
2. `src/lib/services/turns.ts` spawns the user and assistant messages, resolves auth, checks the
   Zero-Data-Retention (ZDR) gate, and hands off to `src/lib/agent/orchestrator/turn.ts`.
3. `src/lib/agent/compose.ts` assembles the request, which means system preambles, message history
   and tool definitions. Enabled modules contribute tools and preambles through
   `ModuleRuntime.compose`, and may set `requiresPlanning` to demand the multi-round planning loop,
   or `loop: 'agent'` to demand the visible agent loop (see below).
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

### Model families

The curated picks and every default name a **family**, not a model: OpenRouter's own alias ids
(`~anthropic/claude-opus-latest`, `~openai/gpt-luna-latest`), listed in
`src/lib/models/dynamicDefaults.ts`. The provider says what a family means today. OpenRouter lists
each alias with `alias_target`. The Claude API has no moving aliases, since every id is a pinned
snapshot, but its ids follow a documented `claude-{name}-{major}[-{minor}]` scheme and its list is
newest first, so the family resolves there by name. A pin covers an empty model list.

A chat stores the concrete id its family resolved to when it started, and every request names that
id, so pricing, capabilities, ZDR and prompt caching describe the real model and a conversation
never changes model underneath itself. When a family moves, `loadModels` says so once: new chats
take the new model, chats under way keep theirs. New chats start with the first family in
`DEFAULT_MODEL_PREFERENCE` that the user's providers serve (GPT Luna, then Claude Opus on a Claude
API key alone). The tutor stays pinned to the model its prompt was tuned on, and falls back through
`TUTOR_MODEL_PREFERENCE` if it disappears. Neither default ever falls back to a model on the user's
own server while a built-in provider can serve one. Claude capabilities (adaptive thinking, effort
levels, caching) are likewise read from the id's generation, not from a list of ids.

## Tools and search

The tool registry (`src/lib/tools/registry.ts`) is open and keyed by string. An entry is
`{ definition, metadata, handler? }`, and `metadata.kind` is what the scheduler reads.

- `action` is ordinary. Any number may run per round (`web_search`, `web_fetch`).
- `content` runs at most once per round, after the round's other calls: it puts something in
  front of the user, so it should see the round's other changes.
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

### Two turn loops

A turn with tools runs one of two loops in `src/lib/agent/streaming/`.

- **The default loop** (`streamingTurn.ts`, used by search) paints the first round, clears it if
  the model calls tools, runs further rounds silently, then streams a closing answer or keeps the
  first draft.
- **The agent loop** (`agentLoop.ts`, requested by a module with `loop: 'agent'`) streams every
  round visibly into the one reply, a blank line between rounds. Tool calls present in a round
  run whatever the finish reason says, and every call gets a result: a handler returns a
  model-facing `result` (`{ ok: true, ... }` or `{ ok: false, error, hint }`) that the model reads
  and can correct itself from. A handler that returns `endsTurn: true` stops the loop without
  another model call. One that returns `endsTurn: 'after_text'` stops it the same way when the
  turn already has visible text; when it has none, the model reads the handler's
  `resultBeforeText` instead and gets one more round, with `tool_choice: 'none'`, to introduce
  what it showed. The loop is capped at `AGENT_MAX_ROUNDS`, and the last round is sent with
  `tool_choice: 'none'`.

A tool registered with `metadata.replay: true` has its agent-loop rounds stored on the assistant
message as `Message.toolRounds`. `buildChatCompletionMessages` replays them on later turns as real
assistant tool calls and tool results around the reply text, and the token budget keeps or drops a
message together with its rounds, so a result is never orphaned. A request that offers no tools
(or an endpoint that does not declare tool support) gets that history folded back to text by the
transport, because a provider may reject tool traffic it has no definitions for.

## Feature modules

`src/lib/modules.ts` is the single list of enabled modules and the only place core may reach into
one. Removing a feature is deleting its directory and its entry in that file.

A module has two halves.

- **The boot half** is `storeSlice`, `persistFragment`, `decorateMessage`, `settingsDefaults`,
  `panels`, `hasRightPanelContent`, `onBootstrap`, and the hooks core calls through
  `src/lib/modules.ts`: `onChatDeleted` (after a chat is deleted), `onEventsChangedElsewhere`
  (another tab changed a chat's stored event log), `onReplyRetracted` (awaited
  before a reply is regenerated, including an edit that reruns it), `onChatBranched` (awaited
  before a branch opens, with the source-to-copy message id map) and `latestExchangeOnly` (the
  module's record follows this chat's transcript, so regenerate and edit-and-rerun are offered
  and accepted only in the latest exchange; see `canRedoReply`) and `messageHasContent` (the
  module shows something of its own with a reply, such as a card, so a reply with no text is
  not empty). It is statically imported.
- **The turn half** is `load()`, returning a `ModuleRuntime` with `registerTools`, `compose`,
  `planning` and `turnEffects`. It is loaded on demand with the turn pipeline. `compose` receives
  the turn's store, so a module can read (and first load) its own slice, and may return a
  `messagePatch` that core sets on the turn's assistant message.

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
the shapes it persists: `TutorEventRecord`, the envelope of a row in the `tutorEvents` table (the
repository validates only that), `Message.tutorSeq`, `Message.ledger`, and the pre-rebuild fields
(`Message.tutor`, `Message.learnerModel`, `Message.planUpdates`, the plan and learner model in
`ChatSettings.features.tutor`), which are kept readable but are read only by the tutor's one-time
legacy import. The module owns all behaviour.

### The tutor

The tutor's state is one append-only event log per chat, folded by the pure engine in
`src/modules/tutor/engine/` (`state = fold(events)`). The store slice keeps
`tutorSessions[chatId] = { events, state, loaded }` and has one mutation entry point,
`dispatchTutor(chatId, command, { by, messageId })`, which runs the engine's `step`, appends the
events in memory and then to Dexie. Dispatches for a chat run one after another, so a learner's
click and the tutor's tool calls in the same turn can never decide against a stale state. A log
position holds one event (a unique `[chatId+seq]` index): an append that meets a position another
tab took writes nothing, and the slice reloads the log and decides the command again, once. A
write that fails keeps its events in memory and sends them again, first, with the chat's next
write, so the disk never has a hole under later events. A deleted chat's in-flight dispatch writes
nothing more, and a backup import (which reruns bootstrap) forgets every session. The tutor's
tools are the engine's; each handler parses the call into a command and dispatches it.
The UI renders from the same log: cards from their `*_given` / `plan_proposed` events by message id,
margin notes from a message's `evidence_recorded` events, a chapter break from its
`topic_completed` event and the first topic started or reopened after it (what the learner chose at
that seam, whatever became of the topic later), "Why N%" from `explainTopic`. A learner action that needs the tutor's
answer (a finished card, approving the plan, Go on) dispatches its command and then sends a
visible user message with `Message.ledger` set, which the transcript shows as a quiet line and the
model reads as an ordinary message; quiet corrections only dispatch. The lines' words live in
`src/modules/tutor/lib/ledger.ts`, shared with the simulator.

The log follows the transcript, and one rule keeps the two agreeing: **in a tutor chat only the
latest exchange can be redone.** Core regenerate and edit-and-rerun replace a reply in place and
keep every later message, so redoing an earlier reply would take back its cards and evidence while
later replies and ledger lines still described them. Regenerate and Edit are therefore offered
(and accepted, in the store and the turn service) only for the last user message and its replies.
Regenerating that reply appends a `reply_retracted` event, and `fold` drops every earlier event
carrying its message id: the turn's own events and the learner's answers to its cards. Nothing
later can refer to them, because nothing comes later. The reply is then rerun as a whole turn
(fresh state block, tools, agent loop), so a card comes back as a card. Branching copies the
log's share of the copied messages to the branch (`branchEvents`): events of copied messages under
the copies' ids, none of later messages, and unattached events (quiet corrections) up to the
latest position a copied message accounts for, and never short of the legacy import; positions
keep their numbers so `tutorSeq` holds. The legacy import belongs to no reply, so no retraction
reaches it; a proposal still pending at import is a `plan_proposed` on its own reply.

Cards (quiz, intake, diagnostic, plan proposal) are `content` tools that end the turn after text,
so a card put up without a word gets one round to introduce it; state tools are `action` tools. Tool arguments are parsed leniently (`engine/tools.ts`): placeholders in
optional fields and fields that do not apply are dropped and named back in the result as
`adjusted`; only what changes a call's meaning is refused, with a hint naming the field and its
valid values. A field a tool no longer has (record_evidence's `setTo`) is dropped without a word.
A plan's topics may carry a `startingEstimate`, recorded as evidence when the learner approves the
plan: at most `PRACTISING` on the learner's word, and up to just below `READY` once a diagnostic has
tested them. A plan proposal closes an unanswered intake, so a learner who skips the questions is
not kept waiting on the card.

The tutor's own evidence is judged per reply, from a record `fold` keeps of the tutor's latest
reply: one piece per topic, and none that gains on a topic the same reply noted a misconception
on that the answer it responds to showed. Evidence recorded after the note moves nothing; a gain
recorded before it is taken back exactly by a `misconception` evidence event naming the evidence
it cancels, which then stops counting toward mastery. A misconception noted as shown by an earlier
answer (`shownBy: 'earlier_answer'`) leaves the reply's gain standing, and is accepted as such only
when the log already holds a mistake on the topic from before the reply; older notes carry no
`shownBy` and replay as the latest answer's. `partial` never lowers an estimate and, led to (`helped`), moves nothing.
These rules live in `decide`, and `fold` replays what was decided, so older logs keep their values.
Reopening a topic (more practice at a chapter break, or taking it up again) keeps its estimate;
completing it again as mastered needs fresh work counted from the reopening.

Every tutor turn runs the
agent loop, reads a state block rendered from the log, and records on its reply
(`Message.tutorSeq`) the log position it saw, so the next turn can tell the tutor what the learner
changed since. The tools offered follow the state, and the agent loop reads them again after each
round (`ModuleComposeContribution.refreshTools`), so a topic started in one round can be quizzed in
the next round of the same turn.

## Deployment

`bun run build` emits `dist/`, a static site. There is no worker, no API route and no environment
the deployment has to carry, because every provider call leaves the visitor's browser with the
visitor's own key. `wrangler.toml` describes a Cloudflare Worker with no code of its own that
serves `dist/` as static assets, with the SPA fallback set there; other hosts need the equivalent
rule.

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
| Cross-tab sync           | `src/lib/sync/tabChannel.ts`, `src/lib/db/announce.ts`, `src/lib/store/tabSync.ts`          |
| Feature modules          | `src/modules/**`, listed in `src/lib/modules.ts`                                            |
| Styles and tokens        | `styles/**`                                                                                 |
