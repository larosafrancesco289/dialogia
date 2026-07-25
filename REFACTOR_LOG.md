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
