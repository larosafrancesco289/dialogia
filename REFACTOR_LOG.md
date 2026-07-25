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

Branch: `stage-1-decouple`, merged to main 2026-07-25 after an independent review pass
(see the post-review fixes at the end of this section). CI green
(`scripts/ci.sh`: lint:types + 432 tests + prettier + eslint, 0 errors, the same 5
pre-existing warnings). Production build succeeds; First Load JS for `/` is 313 kB gz,
down from Stage 0's 334 kB.

**Headline: 254 files changed, +3,939 / −12,178 lines.** The research apparatus is off
main, the tool registry is open, tool gating carries no phase knowledge, the three store
mirrors are gone, and the tutor is a genuinely removable module: deleting its directory
and its one registration line leaves a compiling, building chat app. All seven Stage 1
tasks are complete.

Commits:

- `86e9394` Move the research apparatus off main — `research` branch created at main
  (`89f139b`); pushed to origin 2026-07-25. Deleted `src/tooling/eval`, `src/lib/study`,
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

Deleting `src/modules/tutor` plus its registration block in `src/lib/modules.ts` (the
imports, the `tutorModule` literal, and the `ENABLED_MODULES` entry — ~15 lines, one
file) leaves the app source type-checking with **zero errors** and `bun run build`
succeeding (First Load JS 306 kB without the module). At the time of the initial report
the build also required deleting `scripts/tutor-sim.ts`; that CLI has since moved inside
the module (see the post-review fixes below), leaving only a dangling `tutor:simulate`
script in `package.json` that fails only if invoked. The only remaining type errors are
inside test files that assert on tutor behaviour, which a fork removing the feature
would delete along with it. The ESLint
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

### Post-review fixes (2026-07-25)

An independent review pass after the initial report found and fixed on this branch:

- **Blocker:** `createTurnEffects` snapshotted `loadedModuleRuntimes()` at lifecycle
  creation, which happens before the turn's first `loadModuleRuntimes()` await — so
  module turn effects were silently dropped on the first turn of every page session
  (a newly generated learning plan and learner-model update were never persisted).
  Effects now resolve lazily at the first hook call, memoized so per-turn accumulator
  state survives. Regression-tested in `tests/turnEffects.test.ts`.
- Legacy deep-research messages whose only answer text lived in `deepResearch.answer`
  (empty `content`) were silently destroyed by the sanitizer strip. The answer now
  folds into empty `content` before the field drops, and repository reads sanitize
  like saves do, so the text renders without waiting for a rewrite.
- `loadModuleRuntimes` cached a rejected chunk-import promise forever, breaking every
  turn after one flaky network failure until reload; the cache now clears on rejection
  so the next turn retries.
- The module-boundary lint only caught static alias imports; dynamic `import()` and
  relative specifiers are now caught too via `no-restricted-syntax` (both probed
  empirically).
- The tutor simulation CLI moved from `scripts/tutor-sim.ts` to
  `src/modules/tutor/tooling/simulate.ts`, so the delete experiment touches nothing
  outside the module directory and `src/lib/modules.ts`.

## Stage 2 — Migrate to Vite + TanStack Router + Cloudflare (2026-07-25)

Branch: `stage-2-migrate` (6 commits, not merged, not pushed). CI green
(`scripts/ci.sh`: hygiene + lint:types + 440 tests + prettier + eslint, 0 errors, the
same 5 pre-existing warnings). Both builds verified, and the app was driven in a
browser at desktop and mobile widths.

**Headline: Next is gone. 79 files changed, +2,058 / −1,205.** The app is a static
SPA; the hosted machinery is a Cloudflare worker built from `functions/`. Initial JS
is **258 kB gz, down from 313 kB** (Stage 1's figure), with 28 kB of CSS and three
self-hosted font files. All six Stage 2 tasks are complete.

Commits:

- `0b356d1` Scaffold the Vite + TanStack Router SPA shell — `index.html`, `src/main.tsx`,
  `src/router.tsx` (two routes: `/`, and `/access` in hosted builds only),
  `styles/globals.css`, Tailwind v4 via `@tailwindcss/vite`. The theme-init IIFE is
  injected into the HTML by a small plugin that calls `injectThemeClass()`, so the
  inline script and the runtime theme logic still have one source.
- `7cf3072` Replace the Next runtime primitives with plain web equivalents — `next/image`
  → `<img>`, `lazyClient` → `React.lazy` + `Suspense`, `NEXT_PUBLIC_*` →
  `import.meta.env.VITE_*`, and the matchMedia redesign of `initialIsMobile`.
- `2531b5f` Port the hosted variant to Cloudflare.
- `b709afd` Ship the app as an installable PWA.
- `3564bc1` Drop the Next and Vercel dependencies.
- `8c2b3f6` Read the server production flag from the bound environment.

### Deviations from the plan (and why)

- **The hosted variant is a `_worker.js` in Cloudflare Pages _advanced mode_, not
  `functions/api/*` routed by Pages.** Pages compiles `functions/` with esbuild and does
  not resolve `tsconfig` path aliases, so a Pages-routed function could only reach the
  server modules through relative imports — and the whole `@/lib/**` graph behind those
  routes uses aliases, which AGENTS.md requires. The source layout the plan asked for
  survives (`functions/api/*` is one module per endpoint, `functions/middleware.ts` is
  the gate); `functions/routes.ts` maps paths to handlers and `functions/worker.ts` is
  the entry, all bundled by `vite.worker.config.ts` into `dist/_worker.js` (87 kB raw,
  24 kB gz). Advanced mode also bypasses `_redirects`, so the worker performs the SPA
  fallback itself; `public/_redirects` still covers the static BYOK deploy.
- **Server config is read through a bindable env source** (`src/lib/env/source.ts`).
  Cloudflare hands the environment to the worker per request rather than exposing
  `process.env`, and threading an env argument through `env/server.ts`,
  `tierApiKey.server.ts` and the provider pipelines would have been a far larger change
  than the stage justified. `bindServerEnv(env)` runs once per request in
  `worker.ts`; Node (tests, CLI) falls through to `process.env`. The built worker
  contains no `process` reference at all.
- **A missing `NODE_ENV` is now read as production.** The old middleware bypassed auth
  whenever `NODE_ENV !== 'production'`, and Cloudflare simply does not set the variable —
  the old default would have disabled the access gate on a live deployment.
  `isServerProd()` reads the bound env and defaults the safe way; `bun run dev` and
  `wrangler` runs need an explicit `NODE_ENV=development` for the bypass. Covered by
  `tests/accessGate.test.ts`.
- **Fonts are latin-only variable cuts, not the plan's per-weight `@fontsource` files.**
  Three woff2 files (Newsreader roman + italic, Plus Jakarta Sans roman, 147 kB total)
  replace the seven static weights `next/font` generated, and cover the full 200–800
  range instead of the three or four weights the CSS actually names.
- **`isProd()` vs `isServerProd()` is now a real distinction.** `isProd()` reflects the
  build mode (`import.meta.env.MODE`) and is the client's notion; the worker bundle is
  always built in production mode, so anything server-side that must react to a
  deployment's `NODE_ENV` (cookie `Secure`, the auth timing switch, the debug route)
  uses `isServerProd()`.

### Auth crypto consolidated on WebCrypto

`token.server.ts` and `fingerprint.node.ts` are deleted. `token.edge.ts` gained
`createAuthToken(claims, secret)` and `hmacHex(value, key)`, so token minting and access
code hashing are async and run anywhere. `cookies.server.ts` was rewritten around plain
`Set-Cookie` serialisation plus a request cookie parser, and `getServerTier(req)` reads
the tier from the request instead of `next/headers`. `getClientIp` prefers
`CF-Connecting-IP`, which the client cannot spoof, over the forwarding chain.

### Verified, not assumed

- `bun run dev` and the production preview both boot: dark theme applied before paint,
  self-hosted fonts resolved, no console errors, the lazily loaded settings drawer opens.
- The mobile shell renders on first paint at 375px with no desktop flash — the
  `mounted` dance and the UA-derived `initialIsMobile` prop are gone from
  `useAppBootstrap`, `HomeClient` and `MobileShell`.
- The built `dist/_worker.js` was driven directly with a stubbed `ASSETS` binding:
  unauthenticated `/` and `/deep/route` redirect to `/access` (307), `/access` and
  static assets pass, an unknown `/api/*` is a 404 JSON error, `POST
/api/auth/set-free-tier` mints an HttpOnly token, `/api/tavily` refuses the free tier
  (403), and a request carrying the minted cookies gets the app shell back through the
  SPA fallback.
- The production build registers and activates a service worker with 124 precached
  entries including the app shell.
- The module-boundary lint was probed empirically again after the ESLint rewrite: a
  `@/modules/tutor/*` import from `src/lib/store/notices.ts` still errors.

### Numbers

|                  | Before (Next, Stage 1)          | After (Vite)             |
| ---------------- | ------------------------------- | ------------------------ |
| Initial JS (gz)  | 313 kB                          | 258 kB                   |
| Initial CSS (gz) | not counted separately          | 28 kB                    |
| Display fonts    | 7 static cuts via `next/font`   | 3 variable woff2, 147 kB |
| Hosted server    | Next runtime + 35 kB middleware | 87 kB worker (24 kB gz)  |
| Tests            | 432                             | 440                      |

PWA precache is 126 entries / 3.7 MB. KaTeX's font set and the two outsized mermaid
chunks are deliberately excluded and picked up by a runtime CacheFirst rule the first
time a message needs them.

### Things the owner must do

- **`.env.local` still uses the `NEXT_PUBLIC_*` names**, which no longer reach the
  client — the running app shows "Missing provider API key or proxy configuration"
  until they are renamed. The mapping is in `.env.example`: `NEXT_PUBLIC_X` →
  `VITE_X`, except `NEXT_PUBLIC_TAVILY_API_KEY`/`NEXT_PUBLIC_LOG_LEVEL`, which became
  `VITE_TAVILY_SEARCH_ENABLED`/`VITE_LOG_LEVEL`. Server-side names are unchanged.
- **Retiring the Vercel deployment is not done** — the protocol forbids deploying, so
  nothing was pushed or deployed. `vercel.env` is a local, gitignored file and was left
  alone; the plan schedules its deletion for Stage 4.
- `dist/` was briefly tracked by the first four commits on this branch. History was
  rewritten with `git filter-branch` to remove it, and the pre-rewrite commits are kept
  on the local branch **`stage-2-migrate-with-dist`**, which can be deleted once the
  rewritten branch has been reviewed.

### Follow-ups discovered (not done)

- The PWA precache (3.7 MB) is dominated by mermaid's per-diagram chunks. Trimming it to
  a true app shell needs the entry's chunk graph, which the size ceiling only
  approximates; a `injectManifest` service worker or a build-time read of `index.html`
  would do it precisely.
- `AccessPage` is code-split into its own chunk in the BYOK build even though the route
  is never registered there. It is ~1 kB and never fetched, but a dead-export check
  (Stage 4) will notice it.
- `_worker.js` is a single inlined bundle because Cloudflare wants one file; the dynamic
  imports inside `routeBuilder` (rate limiter, tier lookup) therefore no longer split.
  Harmless at 24 kB gz, worth remembering if the worker grows.
- No maskable PWA icon exists; the manifest declares `purpose: 'any'` only. Generating a
  maskable variant is a small asset task.
- `styles/mobile.css` still has the orphaned `.swipe-action-reveal` rules Stage 0 and
  Stage 1 both noted. The CSS pass this stage was limited to moving the entry file.
- The 5 pre-existing ESLint unused-var warnings are unchanged.
