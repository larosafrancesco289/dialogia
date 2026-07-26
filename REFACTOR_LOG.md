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

### Addendum — dev-server API parity (same day)

Restoring `bun run dev` to a working state needed one more commit. `next dev` used
to serve the API routes; after the migration `vite dev` had no `/api/*` at all, so in
proxy mode the client's model and chat calls hit the SPA fallback and got HTML back.
`vite.config.ts` now mounts the worker's own route table as dev middleware
(`functions/devServer.ts` bridges Node's req/res to `Request`/`Response`, piping the
body so streamed completions still stream), reads server keys with `loadEnv` since
Vite only exposes `VITE_*`, and answers an unmatched `/api/*` with the same 404 JSON
the worker returns. Verified: `/api/openrouter/models` and `/api/openrouter/endpoints/zdr`
return JSON in dev, `/api/nope` is a 404, and non-API paths still fall through to the SPA.

Left unresolved: a "Missing provider API key or proxy configuration" toast still
flashes once at boot and auto-dismisses after 10s, on a dev server where the proxy is
configured and the model list does load. It is not `modelSlice`'s
`authEntries.length === 0` branch (instrumented, never fired) and not a persisted
notice (the localStorage blob has none); `requireTransportAuth` resolves for both
transports when called directly. The remaining candidate is a boot-time path through
`services/auth.ts`. Cosmetic, but unexplained, and there is no pre-migration baseline
left to compare against — worth a look during review.

**Resolved during review.** The toast never came from the dev code at all. `bun start`
(`vite preview --port 3000`) shares the dev origin, so running the production preview
left the PWA service worker registered on `localhost:3000`; every later `bun run dev`
visit was served the stale precached production shell instead of dev modules (hence
instrumenting the source never fired). That shell had been built while `.env.local`
still carried the `NEXT_PUBLIC_*` names — its baked `import.meta.env` contains no
`VITE_*` keys, so both transports failed auth and `modelSlice`'s empty-`authEntries`
branch fired, in the stale bundle. Meanwhile `/api/*` bypassed the worker
(`navigateFallbackDenylist`), which is why the model list still loaded and made the
toast look impossible. Fix: the dev server now serves a self-destroying `/sw.js`
(`devSwSelfDestruct` in `vite.config.ts`) — a polluted browser unregisters the stale
worker, purges its caches, and reloads into the real dev bundle on the next update
check. Verified end to end against a browser carrying the stale worker.

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

## Stage 3 — BYOK and providers (2026-07-25)

Branch: `stage-3-byok` (5 commits, not merged, not pushed). CI green
(`scripts/ci.sh`: hygiene + lint:types + 470 tests + prettier + eslint, 0 errors, the
same 5 pre-existing warnings). Both builds verified, and the BYOK first-run flow was
driven in a browser with the proxies switched off.

**Headline: keys stop being a build-time concern. 126 files changed, +2,993 / −755.**
The closed `ModelTransport` union is gone; a call is described by a `ProviderEndpoint`
the user configures, and the key it needs lives in the browser. Initial JS is **262 kB
gz** (Stage 2 left it at 258 kB); the worker is unchanged at 25 kB gz. All six Stage 3
tasks are complete.

Commits:

- `0f4c0fe` Replace the transport union with configurable provider endpoints — Design C.
- `ae5bd19` Make Anthropic usable directly from the browser.
- `d3f10e7` Add key management and a first-run setup flow.
- `3772eb7` Stop tier gating from hiding BYOK models, and prefer the user's key.
- `973d6e9` Offer a search mechanism choice in the composer — Design D's UI half.

### The shape that came out

- `src/lib/transport/endpoints.ts` holds `TransportKind`, `EndpointCapabilities` and
  `ProviderEndpoint` exactly as Design C names them, plus the two frozen built-ins.
- `src/lib/transport/endpointRegistry.ts` is the synchronous view the request path
  reads. Endpoint _configuration_ is owned by a new persisted store slice
  (`customEndpoints`), which republishes into the registry on every mutation and on
  the persist merge. This split exists because auth resolution and body building are
  synchronous all the way down and sit below the store.
- `src/lib/keys/store.ts` is a **separate IndexedDB database** (`dialogia-keys`), not a
  table in `dialogia`. `exportAll` walks the chat database, so "keys are never
  exported" is structural rather than a rule someone has to remember. Reads are
  synchronous against a cache warmed by `loadKeys()`, which `bootstrapApp` and
  `loadModels` both await so a slow IndexedDB read can never look like an
  unconfigured app.
- `TransportAuth` is `{ endpoint, apiKey? }`. `TITLE_MODELS`, `TRANSPORT_LABELS` and
  `TRANSPORT_AVAILABILITY` became functions over an endpoint, as the design asked.
- `src/lib/search/providers/*` is Design D: `SearchProvider` with
  `search`/optional `fetchPage`, a registry, and Tavily as the first implementation.
  `web_fetch` is offered to the model only when the active provider has `fetchPage`.

### Deviations from the baked designs

- **`ProviderEndpoint` gained four fields** beyond Design C: `modelIds` (the free-text
  model entry the task list asked for), `titleModelId` and `disableTitleGeneration`
  (the "use chat model / disabled" path), and nothing else. `capabilities` behaves as
  specified — unlisted means never emitted.
- **`openai-compatible` is not a separate client.** Design C called it "a slimmed
  OpenRouter client with capability-gated body building", and that is what it is, but
  literally rather than by duplication: `src/lib/openaiCompat/` owns model handling
  and re-exports OpenRouter's chat/stream, while `buildChatBody` gates on the
  endpoint's capabilities and `orFetch` derives base URL and headers from it. Forking
  ~250 lines of SSE and tool-call accumulation to own a second copy of the same wire
  protocol would have been the larger risk.
- **`SearchProvider` the union became `SearchMode = string`.** Design D reuses the name
  `SearchProvider` for the new object type, but the old union
  (`'tavily' | 'openrouter'`) was threaded through ~40 sites. The union is now
  `SearchMode`, deliberately open like Design A's `ToolName`, with
  `NATIVE_SEARCH_MODE = 'openrouter'` kept as a constant because that literal sits in
  users' persisted chat settings. `ChatSearchSettings.provider` widened from a zod
  enum to `z.string()`, which is a widening — old data still parses.
- **The search-provider registry self-registers on import of
  `@/lib/search/providers`**, the same safety net Stage 1 used for the tutor tool
  accessors. The Tavily _descriptor_ is eager (the settings UI and `selectSearchMode`
  read the registry synchronously) but its request code is behind a dynamic import,
  so Tavily's payload builders stay out of the boot bundle. Read the registry through
  the barrel, never through `registry.ts`.
- **`resolveModelTransport` became `resolveModelEndpoint`.** The prefix heuristics
  survive as the legacy fallback the design asked for (`anthropic/` and
  `anthropic-direct/` → the built-in Anthropic endpoint) and are covered by
  `src/lib/providers.test.ts`; user endpoints claim the `<endpointId>/` prefix, which
  is how `(endpointId, transportModelId)` stays unique in one flat model list.

### Two BYOK bugs the browser found

Neither was on the task list; both made the BYOK build unusable, so they are fixed here.

- **A static build read the missing tier cookie as `'free'`** and the model picker hid
  nearly everything. Tiers ration the hosted deployment's own keys; a build with no
  gate has no key to ration, so `getClientTier()` now returns `developer` when
  `isHostedBuild()` is false.
- **Tier gating applied to user-configured endpoints.** A local Ollama model would have
  been free-tier-blocked despite costing the deployment nothing. Gating now applies
  only to models whose endpoint is actually spending the deployment's key.

Related, and a deliberate behaviour change: **a key the user pastes now wins over the
deployment's proxy** (`usesProxy()` is false when an `apiKey` is present). Pasting your
own key should mean your key is the one spending. The proxy remains the fallback and
still carries no client credentials in either direction.

### Hosted proxy hygiene

Re-read rather than assumed. `functions/api/openrouter/chatCompletions.ts` and
`functions/api/anthropic/messages.ts` build their auth from the _server_ environment
(`resolveOpenRouterAccess(req)` / `resolveAnthropicAccess(req)`) and never read an
inbound `Authorization` or `x-api-key`; `orFetch`/`anFetch` build headers from scratch,
so nothing a client sends is forwarded upstream. The proxy therefore cannot become an
open relay: it injects only the deployment's key, behind the gate and the rate limiter.
The client half is now regression-tested — `src/lib/openrouter/http.test.ts` and
`src/lib/anthropic/http.test.ts` assert that a proxied call carries no credentials at
all, and that a BYOK call goes direct with the right headers.

### The XSS review the plan required before shipping keys

Model output is untrusted and the keys now live in the same origin, so the markdown
pipeline was reviewed rather than assumed safe:

- `rehype-raw` is **not** in the plugin list, so react-markdown v9 escapes raw HTML in
  model output instead of rendering it. An ESLint `no-restricted-imports` rule now bans
  importing it from `src/components/**` with that reason attached, so re-adding it is a
  deliberate act.
- `dangerouslySetInnerHTML` appears once, in the code-block renderer, fed by
  `Prism.highlight` (which escapes text content) or by a local `escapeHtml` fallback.
- Mermaid runs with `securityLevel: 'strict'`, which sanitizes the SVG it returns.
- Link `href`s pass through react-markdown's default `urlTransform`, which strips
  dangerous protocols; this matters because `linkCitationMarkers` injects
  search-result URLs, which are attacker-influenced.

The residual risk is inherent and worth stating plainly: any XSS in this origin can
read the key store, because a browser-held key is readable by the page holding it. The
mitigations above are what keeps that door closed, not the storage choice.

### Verified, not assumed

- **Tavily allows browser CORS.** The plan flagged this as unverified. A preflight to
  `https://api.tavily.com/search` reflects the request origin and allows the
  `authorization` header, so BYOK calls it directly; the hosted `/api/tavily` proxy
  remains the path when the deployment holds the key.
- With both proxy flags off and storage cleared, a fresh load opens the setup sheet;
  dismissing it and pressing send reopens it instead of surfacing an
  environment-variable toast.
- The Providers tab renders all three sections, adds a custom endpoint (persisted as
  `{id, kind, label, baseUrl, apiKeyRef}` — a key _reference_, never a value), and
  edits its base URL, model ids and capabilities.
- The composer's search picker shows Off / Built-in / Tavily once a Tavily key exists,
  and selecting Tavily flips the chat to it. With no search key it stays a plain
  toggle.
- Both builds succeed: static `dist/` at 262 kB gz initial JS, hosted adds a 25 kB gz
  `_worker.js`.

### Not verified (and why)

**An end-to-end BYOK chat with a real key was not run.** Entering an API key into a
field is something I do not do on the owner's behalf. Everything up to that point is
covered — the direct URL, the `Authorization` / `x-api-key` header and the
browser-access opt-in are asserted in tests, and the key-store round trip is driven in
the browser — but the last step (paste a key, watch models load, send a message) is a
ten-second manual check worth doing before merge.

### Persisted-data compatibility

- One new persisted key, `customEndpoints`; no renames. `tests/persistedStoreCompat.test.ts`
  still round-trips a pre-refactor localStorage blob and now asserts the widened key set.
- No store persist version bump and no IndexedDB schema change to `dialogia`. The key
  store is a brand-new database, so there is nothing to migrate.
- `ChatSearchSettings.provider` widened from an enum to a string; a chat that names a
  provider this machine has no key for degrades to provider-native search rather than
  failing (`selectSearchMode`, tested).
- A chat whose model belongs to a deleted endpoint stops being selectable rather than
  erroring (`isModelEndpointAvailable`).
- New tests: 38 across the key store, endpoint store, capability gating, model
  discovery, HTTP targeting, search-mode selection and the Anthropic fixes
  (432 → 470 since Stage 2's 440).

### Things the owner must do

- **`.env.local` still sets `VITE_USE_OR_PROXY=true` and `VITE_USE_ANTHROPIC_PROXY=true`.**
  That is fine and keeps working, but it means the local dev app is _not_ exercising
  the BYOK path by default. Turn both off to see what a fresh user sees. (They were
  toggled off during verification and restored.)
- `VITE_OPENROUTER_API_KEY` / `VITE_ANTHROPIC_API_KEY` **no longer do anything**. The
  plan required that no env-var key path survive in the BYOK build. `.env.example`,
  `CONFIGURATION.md` and `README.md` were corrected; if either name is set locally it
  is now inert.
- `.claude/launch.json` gained a second, gitignored dev-server entry on port 3100 so
  this session could run alongside another. Delete it if you do not want it.

### Follow-ups discovered (not done)

- **`src/components/composer/ComposerMobileMenu.tsx` is dead** — nothing imports the
  component, only its `Effort` type. It survived Stage 0's sweep for that reason. The
  mobile composer therefore has no search-mode picker; the desktop one does.
- The tutor's headless simulation resolves auth through `resolveAuthFactory`, which
  still assumes an OpenRouter key for every endpoint. It works because the CLI only
  ever uses OpenRouter models, but it would mis-key a custom endpoint.
- `ChatSettings.features.search.provider` has no settings-drawer control; the composer
  picker is the only way to change it. Fine today, worth a Settings row when a second
  provider ships.
- Endpoint capability toggles have no "test this connection" button. A one-shot
  `/models` probe with a visible result would make configuring a local server much less
  of a guessing game.
- `src/lib/policy/providerAvailability.ts` shrank to two functions and now overlaps
  `endpointRegistry`; it may want folding in during Stage 4's cleanup.
- The 5 pre-existing ESLint unused-var warnings are unchanged.

## Stage 3 fix pass (2026-07-25)

Branch: `stage-3-byok`, four commits on top of the Stage 3 report. Prompted by a
three-way review of the full branch diff (transport/keys/auth, provider clients +
worker, search + UI), which found three blockers and two misrouting bugs the Stage 3
suite did not cover. All five are fixed here; each fix landed with a test that fails
without it, and every intermediate commit passes `lint:types` + the full suite
(verified with `git rebase --exec`). CI green at the tip: 477 tests (470 before),
0 ESLint errors, the same 5 pre-existing warnings.

Commits, in dependency order rather than severity order:

- `57811d8` Stop trusting apiKeyRef from persisted endpoint state — `sanitizeEndpoint`
  now always derives `apiKeyRef` from the endpoint id and ignores the blob, closing an
  import-a-backup exfiltration: a hostile endpoint could otherwise name
  `apiKeyRef: 'openrouter'` and have the app send the real OpenRouter key (plus the
  conversation) to its own base URL. The `addEndpoint`/`updateEndpoint` types no
  longer accept a caller-supplied ref, so the convention is compiler-enforced.
- `e35a04f` Resolve proxy paths only inside a real browser context — the frozen
  import-time `apiDefaults.isBrowser` became a call-time `isBrowserContext()`, and
  both clients gate the proxy decision on it. Without this the hosted worker's ZDR
  route fetched its own relative proxy path from inside the worker (a throw), so
  ZDR-only mode on a hosted build returned zero models.
- `300f792` Namespace user endpoint model ids and fail closed when the endpoint is
  gone — custom endpoint model ids are now `endpoint:<slug>/<model>`; no upstream id
  has a colon-bearing first segment, so an endpoint slugged `openai` can no longer
  shadow OpenRouter's `openai/gpt-4o` (previously: byte-identical id, custom merged
  last, wins). The registry split into non-throwing `findModelEndpoint` (labels and
  body-shape decisions, which must survive stale model lists) and throwing
  `resolveModelEndpoint` (the request path): a chat scoped to a deleted endpoint now
  surfaces a "re-add it or pick another model" notice instead of silently falling back
  to OpenRouter and shipping a local-only history to a third party. No migration: the
  old id form never shipped.
- `f79283b` Let keyless OpenAI-compatible endpoints authenticate — `requireEndpointAuth`
  threw `missing_provider_key` for every keyless, unproxied endpoint, which dead-ended
  the headline local path: SetupSheet → "Local" → add Ollama → zero models → the sheet
  re-opens. `allowsKeylessCalls` (openai-compatible **and** a base URL) now gates the
  throw, and the ProvidersPanel status only claims "Ready (no key needed)" when it is
  true. The dead `isEndpointReady` was deleted rather than fixed.

Review findings deliberately **not** fixed here, still open for Stage 4: the
`promptCaching` capability checkbox does nothing (`cache_control` rides inside
messages, which `buildChatBody` copies verbatim — a strict server 400s the request);
`removeEndpoint` orphans the endpoint's key, and slug reuse can re-bind it to a new
host; a key pasted while `loadKeys()` is still warming is evicted by the stale
snapshot; the composer search picker reads the key cache without subscribing (and the
Tavily `ApiKeyField` lacks `onChanged`), so a new Tavily key is invisible until
reload; regenerate computes plugins before the search-mode fallback and can drop
search; the SetupSheet renders at `z-50` beneath the settings drawer's `z-[70+]` and
bypasses the Dialog primitives; assorted `'tavily'`/`'openrouter'` literals survive in
`followUp.ts`, `regenerate.ts`, `modes.ts`; `src/lib/anthropic/models.ts` hardcodes
the built-in endpoint id; ARCHITECTURE.md still documents the deleted
`ModelTransport` union. The end-to-end BYOK send with a real key also remains the
owner's ten-second pre-merge check.

## Stage 4 — Docs and release (2026-07-25)

Branch: `stage-4-docs-release` (4 commits, not merged, not pushed). CI green
(`scripts/ci.sh`: hygiene + lint:types + 485 tests + prettier + eslint + knip,
0 errors, the same 5 pre-existing warnings). Both builds verified; the
tutor-delete experiment re-run and still passing.

**Headline: the docs now describe the app that exists, and CI can tell when
they stop. 41 files changed, +1,493 / −1,819.** Six markdown files became four:
1,164 lines of documentation became 841, and none of it describes a file that
is not there. All five Stage 4 tasks are complete, plus the Stage 3 review
findings that the fix pass explicitly parked here.

Commits:

- `cfeafb1` Close the BYOK gaps the Stage 3 review deferred.
- `c301231` Collapse the docs to README, ARCHITECTURE, CONTRIBUTING and DESIGN.
- `0306315` Add a dead-code check to CI and delete what it found.
- `587cd39` Prepare the repo for public contributors.

### Scope call: the deferred Stage 3 findings were fixed here

Stage 4's task list is docs and release, but the Stage 3 fix pass closed with a
list of review findings marked "still open for Stage 4". Several of them break
the stage's own acceptance criterion — a newcomer reaching a working BYOK app
from the README — so they were treated as part of this stage rather than left
for a stage that does not exist. Each landed with a test that fails without it;
the three ordering/race fixes were probed empirically by reverting the fix and
watching the new test go red.

- **A key pasted during warm-up was evicted.** `loadKeys()` builds a fresh map
  from IndexedDB and assigned it wholesale, so a `setKey` that landed while the
  read was in flight vanished when it resolved — the app would insist it had no
  key seconds after being given one. Mutations during a read are now tracked and
  win over the snapshot, deletes included.
- **`removeEndpoint` orphaned its key.** The ref is derived from the endpoint id,
  so re-adding an endpoint with the same label re-slugged to the same id and
  silently inherited the old key — pointed at whatever host the new endpoint
  named. Removal now deletes the key.
- **The `promptCaching` capability did nothing.** `cache_control` is injected in
  `agent/cache` at eight call sites that know nothing about endpoints, and
  `buildChatBody` copied the messages verbatim; a strict server 400s on the
  unknown key. The gate now lives where every other capability gate lives — in
  `buildChatBody`, which strips the markers and collapses text-only block arrays
  back to plain strings for endpoints that did not declare caching. Built-ins are
  untouched.
- **Regenerate could silently drop search.** Plugins were composed from the raw
  chat setting before `resolveTurnSettings` ran, so a chat configured for Tavily
  on a machine with no Tavily key degraded to provider-native search and then
  never got the `web` plugin that delivers it. Plugins are now built from the
  resolved settings.
- **`SearchMode` was still being treated as a closed set** in `followUp.ts` (a
  literal `=== 'tavily'`) and in regenerate's provider normalization (an
  allowlist of two). Both now go through `isNativeSearchMode` / accept any
  registered id. `search/ui/modes.ts`, also named in the review, was already
  clean.
- **The composer's search picker did not subscribe to the key store**, so a new
  Tavily key was invisible until reload. It now calls `useProviderKeys`, and the
  search-provider `ApiKeyField` gained the `onChanged` it was missing.
- **The setup sheet rendered at `z-50`, beneath the settings drawer's `z-[80]`.**
  It now portals to `document.body` through the `Dialog` primitives at
  `z-[90]`/`z-[95]` and closes on Escape. Verified in a browser: with the drawer
  open, the sheet hit-tests above it across the overlap, and Escape closes it.
- **`anthropic/models.ts` hardcoded the built-in endpoint id** into every
  descriptor; it now takes it from the call's endpoint, matching `openaiCompat`.

### The doc set

`PRODUCT.md` and `CONFIGURATION.md` are gone. `CONTRIBUTING.md` is new.

- **ARCHITECTURE.md** was the worst offender and is rewritten from the tree
  rather than edited. The old one documented `app/api/*` routes, the deleted
  `ModelTransport` union, `src/lib/tutor/index.ts`, `src/lib/agent/streaming.ts`
  as the streaming home, and a "Public Module Surfaces" table whose entries had
  zero importers — three of which this stage deleted as dead files. The new one
  covers what Stages 1–3 actually built: the module system, the endpoint/key
  split, the search-provider interface, the worker, and the reasons behind each
  boundary rather than a restatement of the lint config.
- **README.md** leads with the two quickstarts the plan asked for (own key,
  local model), then deploy-your-own, then a configuration reference absorbed
  from CONFIGURATION.md, then the hosted appendix. Cut: the Next-era project
  tree, `scripts/tutor-sim.ts` (moved inside the module in Stage 1), the
  `styles/foundations.css` and `/api/xai/session` references, `.next/` in the
  local-artifacts list, and ~90 lines of tutor-mode manual that read as product
  copy.
- **CONTRIBUTING.md** carries commands, conventions, the boundary list, testing
  practice and PR expectations — plus a "things that will bite you" section, and
  the `bun start` service-worker trap that cost Stage 2 a debugging session.
- **DESIGN.md** dropped its 107-line YAML token dump. It was also _wrong_: it
  named the dark accents `#c9a227`/`#8b5a9e` where `styles/tokens.css` says
  `#cda85f`/`#b48ad0`, and called the system "The Tutor's Desk" where the CSS
  and AGENTS.md say "Imperial Archive"/"Candlelit Study". The CSS is now stated
  as the source, the naming matches it, and PRODUCT.md's brand and principles
  are absorbed.
- **AGENTS.md** went from a summary of the codebase to the eight invariants a
  model cannot infer by reading the code once, plus pointers. Everything
  derivable from the tree was deleted.

### The dead-code check

`knip` runs in `scripts/ci.sh` over **files, dependencies, unlisted, unresolved
and binaries** — the classes that can be held at zero today, so the gate is
green and a newly orphaned file or dependency fails the build.

It immediately found nine zero-importer files, now deleted: `src/lib/agent/index.ts`,
`src/lib/agent/streaming/index.ts`, `src/lib/auth/index.ts` (three of the old
"public module surfaces"), `src/lib/hooks/useSwipeGesture.ts` and its
`src/lib/mobile/gestureConfig.ts`, `src/lib/store/chatSettings.ts`,
`src/modules/tutor/learning-plan/breadcrumb.ts`,
`src/modules/tutor/tooling/index.ts`,
`src/modules/tutor/tools/definitions/index.ts` — plus the `@cloudflare/workers-types`
and `@eslint/eslintrc` dependencies. Deleting the auth barrel retired one case in
`tests/boundaries.test.ts`; the ESLint rule banning `@/lib/auth/**/*.server` from
components is what guards that boundary now (485 tests, from 486).

**The unused-_export_ backlog is not in the gate**: ~119 exports and ~56 types,
overwhelmingly re-exports in barrel files. Clearing it is a mechanical pass over
~40 files that would have doubled this stage. `bun run knip:exports` reports it.

False positives configured out, with reasons: the two `@fontsource-variable`
packages and `tailwindcss` are reached from CSS, which knip does not follow.
`duplicates` is excluded from the gate because the four hits are deliberate
aliases (`DEFAULT_ENDPOINT_ID = OPENROUTER_ENDPOINT_ID` and similar).

### Release hygiene

- **History is clean.** Every file ever added was enumerated and every commit
  diff scanned for provider-key patterns; the only matches are the placeholder
  strings in `.env.example`. `dist/` blobs exist in exactly one ref, the local
  backup branch `stage-2-migrate-with-dist` — `main` and every other branch are
  clean.
- **`scripts/ci.sh` was never executable** (mode 644), despite being the script
  every document tells contributors to run. Fixed, and the mode is staged.
- **CI is now real.** `.github/workflows/ci.yml` runs `./scripts/ci.sh` plus both
  builds on push and PR. Previously "CI" meant a script someone had to remember
  to run.
- `.env.example` still advertised `FAL_KEY` and `XAI_API_KEY` for routes deleted
  before this refactor began, and legacy `OPENROUTER_KEY`/`ANTHROPIC_KEY`
  fallbacks. Rewritten BYOK-first; the four dead accessors in `env/server.ts`
  went with it.
- Issue templates (bug, feature) and a PR template added. The PR checklist names
  the persisted-data compatibility requirement explicitly.
- Empty `app/` and `docs/` directories left over from the Next era removed.
- LICENSE already existed and is MIT — no decision was needed.

### Verified, not assumed

- **The tutor-delete experiment still passes.** Re-run in a throwaway worktree at
  this branch's tip: deleting `src/modules/tutor` plus its block in
  `src/lib/modules.ts` leaves **zero non-test type errors** (39 remaining errors
  are all inside tests that assert tutor behaviour) and `bun run build` succeeds
  at 251.8 kB gz. CONTRIBUTING.md makes this promise, so it was checked rather
  than inherited from the Stage 1 report.
- The setup-sheet layering was driven in a browser, not reasoned about: with the
  settings drawer open, `elementFromPoint` inside the overlap returns the sheet,
  the portal is the last child of `<body>`, and Escape closes it. (The framer
  entrance animation stalls at partial opacity in the headless tab because
  `document.hidden` is true and rAF is throttled — a harness artifact, not a
  regression; the animation predates this change.)
- Every file path written in backticks across the five docs was checked to exist.
  The only "misses" are relative shorthands inside a section that has already
  named the directory, and build outputs.
- The `// Module:` header convention was measured before being written down:
  70 of 255 non-test `src/lib` files have one, so CONTRIBUTING.md describes it as
  a common pattern to maintain rather than a rule that holds.

### Numbers

|                  | Stage 3              | Stage 4            |
| ---------------- | -------------------- | ------------------ |
| Initial JS (gz)  | 262 kB               | 262 kB             |
| Initial CSS (gz) | 28 kB                | 28 kB              |
| Worker (gz)      | 25 kB                | 25 kB              |
| Tests            | 477                  | 485                |
| Markdown docs    | 6 files, 1,164 lines | 4 files, 841 lines |
| CI stages        | 5                    | 6                  |

Initial JS without the tutor module is 252 kB gz.

### Things the owner must do

- **Nothing has been pushed, merged or deployed** — the protocol forbids it. Four
  stage branches now sit unmerged: `stage-2-migrate`, `stage-3-byok` (already in
  `main` via the merge commit), and `stage-4-docs-release`.
- **The end-to-end BYOK send with a real key is still the owner's check.** Stage 3
  flagged it and it remains true: entering an API key is not something I do on
  the owner's behalf. Everything up to the keystroke is tested; the ten seconds
  after it are not.
- **`stage-2-migrate-with-dist` can be deleted** — it is the only ref carrying
  `dist/` blobs. Deleting a branch is a destructive git operation, so it was left
  alone.
- **`vercel.env` was left in place.** The plan schedules its deletion for this
  stage, but it is a gitignored local file that may still hold keys the owner
  wants; deleting it is theirs to do (`rm vercel.env`).
- `.claude/launch.json` gained a third dev-server entry (port 3200) so this
  session could run beside another; it was reverted before committing.

### Follow-ups discovered (not done)

- **The unused-export backlog** described above. Worth a dedicated pass, ideally
  by deleting the barrels rather than pruning them line by line — the three that
  were entirely dead are already gone, and the survivors mostly re-export things
  their consumers import directly anyway.
- `src/components/composer/ComposerMobileMenu.tsx` is still dead except for its
  `Effort` type, so the mobile composer still has no search-mode picker. Stage 3
  noted it; knip confirms it.
- `src/lib/policy/providerAvailability.ts` still overlaps `endpointRegistry`, as
  Stage 3 noted. Left alone: folding it in is a refactor, not a doc task.
- The tutor's headless simulation still resolves auth through
  `resolveAuthFactory`, which assumes an OpenRouter key for every endpoint.
- Endpoint capability toggles still have no "test this connection" probe. This is
  the single biggest remaining rough edge in the local-model path, and the README
  has to explain the guessing rather than the app removing it.
- The PWA precache is still 3.7 MB, dominated by mermaid's per-diagram chunks.
- No maskable PWA icon exists.
- `styles/mobile.css` still carries the orphaned `.swipe-action-reveal` rules
  that Stages 0, 1 and 2 each noted. Deleting `useSwipeGesture.ts` this stage
  removed the last JS that could ever have used them.
- The 5 pre-existing ESLint unused-var warnings are unchanged. Four of the five
  are now also reported by knip, which is a reasonable prompt to just fix them.
