# Refactor log

Stage reports, newest last. Each stage's executor appends here per the autonomy protocol in
REFACTOR_PLAN.md.

## Stage 0 — Quick wins (2026-07-25)

Branch: `worktree-agent-aa5eadac3c21a5341` (4 commits, not merged). CI green
(independently re-verified: lint:types + full tests + prettier, 0 errors, 5 pre-existing
warnings).

**Headline: First Load JS for `/` went 511 kB → 334 kB gz (−35%).** KaTeX CSS no longer
render-blocking. Remaining first-load is essentially irreducible without the Stage 2 framework
work: react 53 kB, Next runtime 48 kB, framer-motion + Dexie/zod/zustand 106 kB, app 110 kB.

Commits:

- `5985c42` Deduplicate cold-start network fetches — single bootstrap owner (was
  double-bootstrapping on mobile), ZDR endpoint list fetched once with in-flight dedupe,
  ZDR lists + fetchedAt persisted so the 6 h TTL survives reload.
- `e64184c` Defer markdown, math, and turn pipeline out of the boot bundle —
  `Markdown.tsx` is now a 33-line `React.lazy` shim over
  `src/components/markdown/MarkdownRenderer.tsx` with a raw-text fallback; pure text transforms
  extracted to `src/lib/markdown/citations.ts`; `rehype-katex` + katex CSS load as one chunk only
  when content matches a math delimiter; store slices load `@/lib/services/turns` /
  `learnerModelFeedback` via dynamic import at call sites (barrel leak was
  `prepareSendRuntime`). StreamingMarkdown's memoized-block contract preserved. Verified against
  built chunks: `planTurn`, `streamFinal`, micromark, katex all absent from first load.
- `99de6fa` Surface mid-stream errors and parse SSE events per spec — OpenRouter stream now
  throws typed errors on mid-stream `{"error":...}` chunks (was silent truncation); accepts
  `reasoning_content` alongside `reasoning`; `consumeSse` joins multi-line `data:` per SSE spec.
  10 new tests. (Anthropic stream already handled in-stream errors.)
- `e2e30aa` Delete unreferenced components, routes, and migrations — 2,908 lines / 26 files, all
  verified zero-importer. Includes two additions beyond the audit list: `SwipeActionPanel` (+
  css module; orphaned by the SwipeableMessage deletion) and the `/api/auth/logout` entry in
  `PUBLIC_AUTH_PATHS`. `deepResearch`/`parallelModels` untouched (Stage 1 decides).

Deviations / risks:

- Two test fixtures in `tests/apiStream.test.ts` and `tests/transportContracts.test.ts` used
  non-spec SSE (single `\n` between events) and were corrected to `\n\n`. Real providers emit
  `\n\n`; a hypothetical non-conformant provider would now buffer instead of stream.
- Cosmetic: brief raw-text flash on reload until the markdown renderer chunk arrives; math
  renders as source for ~1 RTT on first math content. Accepted for the bundle win.

Follow-ups discovered (not done):

- Idle prefetch or `<link rel="preload">` for the markdown renderer chunk would remove the
  reload flash (natural home: Stage 2, where the HTML shell is rebuilt anyway).
- `styles/mobile.css` has pre-existing orphaned `.swipe-action-reveal` rules + keyframes
  (orphaned before this stage; fold into Stage 2's CSS pass or Stage 1 cleanup).
- The audit's "6.8 kB anthropic in initial bundle" was our own `src/lib/anthropic/*`, not an SDK;
  now deferred with the rest of the turn pipeline.
- 5 pre-existing ESLint unused-var warnings (ModelPicker, useSettingsDrawerState ×2,
  anthropic/chat, tests/compose.test.ts) predate the branch.

## Stage 1 — Decouple (2026-07-25)

Branch: `stage-1-decouple` (13 commits, not merged, not pushed). CI green
(`scripts/ci.sh`: lint:types + 432 tests + prettier + eslint, 0 errors, the same 5
pre-existing warnings). Production build succeeds; First Load JS for `/` is 313 kB gz,
down from Stage 0's 334 kB.

**Headline: 254 files changed, +3,939 / −12,178 lines.** The research apparatus is off
main, the tool registry is open, tool gating carries no phase knowledge, the three store
mirrors are gone, and the tutor is a genuinely removable module: deleting its directory
and its one registration line leaves a compiling, building chat app. All seven Stage 1
tasks are complete.

Commits:

- `86e9394` Move the research apparatus off main — `research` branch created locally at
  main (`89f139b`); **not pushed**. Deleted `src/tooling/eval`, `src/lib/study`,
  `StudySessionSettings.tsx` + `useStudySessionControls.ts`, the `study` access tier and
  its code path, `studyCondition`, `researchMode`, and the tier-derived `forceTutorMode`.
  Persisted store version 6 → 7 with a migration dropping `ui.tutor.researchMode` and
  `ui.tutor.studyCondition`.
- `7850730` Remove the `deepResearch` and `parallelModels` half-features — types, zod
  entries, read paths, and `normalizeParallelModels`. No IndexedDB version bump needed:
  `normalizeChatSettings` rebuilds settings from a fresh literal (dropping
  `parallelModels` on the next chat read) and `sanitizeMessageRecord` now strips
  `deepResearch` on message read, write, and the Dexie upgrade.
- `928b806` Open the tool registry and neutralize tool gating — Design A.
- `5e2d658` Make the tutor type extensions optional — Design A/task 3.
- `4fec2e7` Compose the store from its slices and delete the three mirrors — Design B.
- `f406228` Move the tutor module under `src/modules/tutor` — 75 files, new `@/modules/*`
  alias.
- `a43bfd1` Enforce the module boundary with a ratcheting lint.
- `93e067e` Load module turn-halves with the turn pipeline — fixes a bundle regression the
  move introduced.

### Behavioural consequences worth knowing

- Losing the experimental study conditions means **condition B (full affordances) is now
  the only behaviour**: plan editing and learner-model surfaces are always visible, and
  research mode is always `plan_plus_model`, so plan/learner-model tool gating derives
  only from the user-facing `planEditable` / `enableLearnerModel` settings.
- The quiz budget moved into the tutor's `ToolGate` closure, so **over-budget quiz calls
  are now filtered before the content pick rather than after it**. A different content
  tool can win that round where previously none did.
- Dropped as dead: the unread `baseline` tool tag, the `flashcards` / `srs_review` entries
  in the scheduler's priority lists (they named tools that were never registered), and
  `PlanNode`'s `onInteraction` prop (it existed only to feed study telemetry).

### Deviations from the baked designs (all additive)

- **`ToolGate` gained three optional members** — `contentPriority`, `maxToolsPerTurn`,
  `onScheduled` — so one object carries everything the round scheduler needs from a
  module. `isAllowed` is stateful: the tutor's gate refuses a quiz once its budget is
  spent, and `onBudgetExceeded` says what core should do about a refusal.
- **`AppModule` grew well beyond the shape in Design A4.** Design A4 named `id`,
  `registerTools`, `storeSlice`, `persistFragment` and `panels`. The final shape adds
  `load()`, `compose()`, `planning()`, `turnEffects()`, `decorateMessage()`,
  `settingsDefaults()` and `onBootstrap()`. Every one exists to replace a specific
  hard-coded tutor call in a specific core file — the list is effectively the inventory of
  ways a feature module touches a chat app. `load()` additionally splits the module into a
  boot half and a turn half, which is what keeps it out of the first-load bundle.
- **`ToolMetadata` gained `logCategory`**, replacing the tutor-aware category mapping in
  the tool-call ledger.
- **`PlanTurnResult` keeps its tutor-shaped fields.** They are all core types
  (`LearnerModel`, `Message['planUpdates']`, `LearningPlan`), and core projects them from
  a generically-named `ContentModuleResult` slot in `moduleState`, so they stay undefined
  rather than break when a module is absent. Full opacity would have meant a much larger
  change to `streamingTurn.ts` and the orchestrator for no deletability gain.
- **`src/lib/types/tutor.ts` and `src/lib/types/learningPlan.ts` stayed in core.** They
  are pure declarations of shapes core persists through the now-optional `Message.tutor`
  and `ChatSettings.features.tutor` fields. The boundary drawn is: core declares the
  persisted shapes, the module owns all behaviour.
- **Tutor registry accessors self-register** as a safety net, so no import order can
  observe an empty registry.

### Do not undo these two things

- **`AppModule.load` must stay a dynamic import.** It is what keeps a module's turn half
  out of the boot bundle; a static import there cost 22 kB.
- **Module panels must stay `React.lazy`.** A static import is an initialisation cycle
  through the store, not just a bundle regression.

### Bugs the new tests caught

- Rewriting the tutor tool metadata silently dropped the `quiz` tag, which would have
  broken the quiz budget, the per-node MCQ counter, and the practice priority group.
  `tests/tutorToolContract.test.ts` failed immediately.
- The first version of the composed persist merge spread persisted keys blindly over
  current state, replacing `ui` wholesale before the UI fragment could merge it — wiping
  ephemeral state like `ui.mobile` on every reload. `tests/persistedStoreCompat.test.ts`
  caught it; fragment merges now run against the untouched current state.

### Persisted-data compatibility

- Store persist version 6 → 7, migration drops the two research fields.
- `tests/persistedStoreCompat.test.ts` round-trips a pre-refactor localStorage blob
  through migrate → merge → partialize and asserts the exact persisted key set is
  unchanged.
- `tests/chatSettingsCompat.test.ts` asserts a pre-refactor chat (tutor block present,
  carrying the removed `researchMode` / `parallelModels`) and a chat with no tutor block
  at all both parse and normalize.
- No IndexedDB schema version bump. New tests: 15 across registry, scheduler, gating,
  persisted-store and chat-settings compatibility (417 → 432).

### Design B acceptance, verified

Adding a field and an action to a single slice file typechecks with no other edit — probed
directly on `uiSlice.ts`, then reverted. The three hand-maintained 42-action mirrors
(`tests/helpers/createTestStoreState.ts`, the inline `baseState` in
`tests/updateMessageInChat.test.ts`, `src/tooling/headless/store.ts`) went from 407 lines
to 249 and now build from `buildStoreInitializer()`.

`src/tooling/headless` was kept: the test suite uses it, and Design B named its store
mirror explicitly. It does import the tutor module.

### The tutor-delete experiment passes

Deleting `src/modules/tutor` plus its `ENABLED_MODULES` entry leaves the app source
type-checking with **zero errors** and `bun run build` succeeding (First Load JS 306 kB
without the module). The only remaining type errors are inside test files that assert on
tutor behaviour, which a fork removing the feature would delete along with it. The ESLint
boundary's `ignores` list is now just `src/lib/modules.ts` and tests.

Getting there took four further commits after the initial report, once the owner confirmed
tutor stays first-class and that persisted-data preservation was not a constraint:

- `536da95` **Nine mechanical violations.** `tutorSelectors.ts` moved _to_ core as
  `src/lib/ui/tutorState.ts` — it is plumbing over the optional `UiSnapshot.tutor` field
  core itself declares, with no tutor logic. `persistTutorForMessage` and the
  `persistTutorStateForMessage` store action moved _to_ the module. `src/tooling/headless`
  (10 files) moved under `src/modules/tutor/tooling`; the `@/tooling/*` alias is gone.
  `agent/tools/router.ts` asks the registry for content/meta tool names instead of
  importing `TUTOR_TOOL_NAMES`. `StoreActions` composes a `ModuleStoreActions` interface
  that modules augment by declaration merging.
- `efe981a` **`orchestrator/lifecycle.ts`.** `ModuleRuntime.turnEffects()` returns optional
  `onComposition` / `onPlanResult` / `messagePatch`. The ordering subtlety the old code
  documented in a comment is now structural: modules accumulate their message fields and
  core applies the combined patch at both `onPlanResult` and `beforeStream`, so a module
  never has to care which fires first.
- `d5e238a` **The six UI mounts.** All go through `ENABLED_MODULES[].panels` against five
  typed slots. The header was the hard one: `TopHeaderState` carried ~25 tutor members and
  `useTopHeaderState` composed `usePlanCallbacks`; the toggle, plan badge and plan sheet
  became one store-driven `TutorHeaderSlot`. The settings drawer stopped threading
  `tutorDefaultModel` through `useSettingsFormState`, `useSettingsAutoSave` and
  `buildSettingsSavePatch`.
- `3ae9e5f` **`services/bootstrap.ts`.** An `onBootstrap` hook replaces the direct
  `loadTutorProfileIntoUI` call.

New hooks added along the way, all optional, all replacing a hard-coded tutor call in a
core file: `decorateMessage`, `settingsDefaults`, `turnEffects`, `panels`, `onBootstrap`,
plus `compose` and `planning` from the earlier commits.

**Panels must stay `React.lazy`.** The components import the store, which imports
`@/lib/modules`, so a static import in `src/modules/tutor/panels.ts` is a cycle — the
first version crashed every test with `Cannot access 'ENABLED_MODULES' before
initialization`. It is also what keeps the tutor UI out of the boot bundle.

### Bundle

First Load JS for `/`: 334 kB after Stage 0 → 356 kB after the module move (regression,
diagnosed and fixed) → 333 kB after splitting module turn-halves → **313 kB** after the
panels became lazy. That is 21 kB below where Stage 0 left it, on top of Stage 0's own
35% cut. Without the tutor module at all the build is 306 kB.

### Follow-ups discovered (not done)

- Five tests mix core and tutor assertions in one file (`compose.test.ts`,
  `toolScheduler.test.ts`, `streamingTurn.test.ts`, `messagePipeline.test.ts`,
  `agent/tools.test.ts`). Splitting the tutor cases into the module would make the delete
  experiment a clean `rm -rf` with no test edits at all.
- `src/lib/types/tutor.ts` and `src/lib/types/learningPlan.ts` stay in core by design, so a
  tutor-less build carries ~250 lines of unused type declarations. Harmless, but the
  Stage 4 dead-export check should be told to expect them.
- `styles/mobile.css` still has the orphaned `.swipe-action-reveal` rules Stage 0 noted.
  The CSS for the moved components was not touched; a pass to co-locate module CSS belongs
  with Stage 2's CSS work.
- The 5 pre-existing ESLint unused-var warnings are unchanged.
