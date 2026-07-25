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

Branch: `stage-1-decouple` (8 commits, not merged, not pushed). CI green
(`scripts/ci.sh`: lint:types + 432 tests + prettier + eslint, 0 errors, the same 5
pre-existing warnings). Production build succeeds; First Load JS for `/` is 333 kB gz,
holding Stage 0's 334 kB.

**Headline: 226 files changed, +2,844 / −11,493 lines.** The research apparatus is off
main, the tool registry is open, tool gating carries no phase knowledge, the three store
mirrors are gone, and the tutor lives under one root behind a lint-enforced boundary.
The tutor-delete acceptance test does **not** pass yet — see "What is left" below.

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
- **`AppModule` gained `compose()`, `planning()`, `storeSlice()`, `persistFragment` and
  `load()`** beyond the shape in Design A4. Each exists to keep a core→tutor import out
  of core; `load()` additionally splits the module into a boot half and a turn half (see
  the bundle note below).
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

### Bundle regression, caught and fixed

The first build after the tutor move was 356 kB (up from 334 kB): `src/lib/modules.ts`
statically imported the tutor's compose and tool-registration entry points, and
`store/index.ts` imports `modules.ts`, so the tutor tool definitions, plan-context builder
and profile summariser all landed in the boot chunk — undoing part of Stage 0's work.
`AppModule.load()` now separates the turn half, awaited at the three turn entry points
(`composeTurn`, `planTurn`, `runStreamingTurn`). Verified against the built chunk:
`ask_student_question`, `generatePlanContextPreamble` and `runTavilyFetch` are absent from
first load. `summarizeTutorProfile` remains, pulled in by the tutor store slice, which was
eager before this stage too.

**Do not turn `AppModule.load` into a static import** — that is the whole mechanism.

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

### What is left — the tutor-delete experiment fails

Deleting `src/modules/tutor` plus its `ENABLED_MODULES` entry leaves **164 type errors
across 45 files**, so Stage 1's acceptance criterion for task 5 is **not met**. The
blockers, in descending cost:

1. **The ~6 UI mounts are still direct imports, not slots.** `HomeClient` (LearningPanel),
   `MessagePanels` + `AssistantMessage` (TutorPanel, LearnerModelUpdates),
   `TopHeaderView` + `useTopHeaderState` (TutorToggle, PlanSheet),
   `useSettingsDrawerState` (settings TutorPanel). `useTopHeaderState` is the hard one:
   `TopHeaderState` carries ~20 tutor fields and composes `usePlanCallbacks`, so the
   header needs a real refactor before `panels` slots can be prop-less.
2. **`src/lib/agent/orchestrator/lifecycle.ts`** interleaves learner-model and plan
   persistence with core lifecycle work (systemSnapshot, genSettings, ephemeral-UI reset),
   including a documented ordering contract between `onPlanResult` and `beforeStream`.
   This needs a `turnEffects` module hook with explicit ordering semantics. I stopped here
   deliberately: it is the path that writes user learning data, and rushing it risks
   silent data loss.
3. Smaller, mechanical: `src/lib/services/turns.ts`, `src/lib/services/bootstrap.ts`,
   `src/lib/services/messagePersistence.ts`, `src/lib/turns/runtime/context.ts`,
   `src/lib/store/chatSlice.ts`, `src/lib/store/normalize.ts`,
   `src/lib/store/stateTypes.ts` (`TutorStoreActions` in the composed `StoreActions`),
   `src/lib/settings/normalize.ts` (still hard-codes the tutor block), and
   `src/lib/agent/tools/router.ts` (`TUTOR_TOOL_NAMES` for inline tool-call detection).

The ESLint rule added in `a43bfd1` enumerates exactly these files in its `ignores` list, so
each is a visible to-do and **any new core→module import fails the build** (verified by
adding one to `compose.ts` and watching it error). Working the list down to zero is the
natural first task of a follow-up pass; it is a coherent chunk of work in its own right
rather than a loose end of the moves.

### Follow-ups discovered (not done)

- `normalizeChatSettings` (core) still constructs the tutor settings block by hand; it
  should become module-owned so a tutor-less build does not synthesise the field.
- `src/tooling/headless` is a tutor simulation harness sitting outside the module. Moving
  it under `src/modules/tutor/tooling/` would remove three more boundary violations and
  make the delete experiment cleaner. `bun run tutor:simulate` and two tests depend on it.
- `src/lib/agent/tools/router.ts` detects inline tutor tool calls from a static name list;
  it should ask the registry instead.
- `styles/mobile.css` still has the orphaned `.swipe-action-reveal` rules Stage 0 noted.
  The CSS for the moved components was not touched; a pass to co-locate module CSS belongs
  with Stage 2's CSS work.
- The 5 pre-existing ESLint unused-var warnings are unchanged.
