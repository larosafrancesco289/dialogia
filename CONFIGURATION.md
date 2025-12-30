# Dialogia Configuration

This guide lists required and optional environment variables, how proxy mode works, and the
recommended defaults for development versus production.
For architectural context, see `ARCHITECTURE.md`.

## Environment Files

Dialogia reads configuration from `.env.local` at runtime. Server-only secrets **must not** be
checked into Git. Client-visible variables must begin with `NEXT_PUBLIC_` to be exposed to the
browser. `.env.example` is the authoritative list of supported variables—copy it to `.env.local`
and edit as needed.

For local development, ensure you at least set:

```
NEXT_PUBLIC_USE_OR_PROXY=true
OPENROUTER_API_KEY=sk-or-v1_server_key
```

When `NEXT_PUBLIC_USE_OR_PROXY` is `true`, the client never reads `OPENROUTER_API_KEY`. Instead, the
Next.js API routes under `/api/openrouter/*` forward requests using the server key.

## Runtime Flags

- `NEXT_PUBLIC_USE_OR_PROXY` — toggles proxy mode. Defaults to `false`. When `true`, all model calls
  use the server-side OpenRouter key.
- `NEXT_PUBLIC_OPENROUTER_API_KEY` — client-side key (avoid in production). Only read when proxy is
  disabled.
- `OPENROUTER_API_KEY` — server-side key for OpenRouter. Required when proxy is enabled.
- `NEXT_PUBLIC_USE_ANTHROPIC_PROXY` — optional proxy toggle for direct Anthropic calls. When `true`,
  browser traffic hits `/api/anthropic/*` and the server-side `ANTHROPIC_API_KEY` is used.
- `NEXT_PUBLIC_ANTHROPIC_API_KEY` — client-side Anthropic key (local-only). Avoid in shared builds.
- `ANTHROPIC_API_KEY` — server-side key for Anthropic when proxying requests through Next.js.
- `BRAVE_SEARCH_API_KEY` — enables the Brave Search tool. Used only on the server.
- `XAI_API_KEY` — server-side key for X.AI (Grok) voice sessions via `/api/xai/session`.
- `DEEP_RESEARCH_REASONING_ONLY` — defaults to `true`. Forces the DeepResearch agent to pick models
  that advertise reasoning support; set to `false` to allow experimental providers during testing.
  DeepResearch always executes with the server-side `OPENROUTER_API_KEY`.
- `NEXT_PUBLIC_OR_ZDR_ONLY_DEFAULT` — if `true`, new sessions start with ZDR-only enforcement.
- `NEXT_PUBLIC_OR_ROUTE_PREFERENCE_DEFAULT` — optional routing hint (`speed` | `cost`).
- `AUTH_COOKIE_SECRET`, `ACCESS_CODE_PEPPER`, `ACCESS_CODES_INDIVIDUAL_HASHED`,
  `ACCESS_CODES_DEVELOPER_HASHED` — configure the access gate in `middleware.ts` and `app/access`
  routes.
- `AUTH_DEBUG_ROUTE_ENABLED` — when `true`, allows the `/api/auth/debug` route in production.
- `AUTH_DEBUG_HEADERS` — when `true`, middleware adds `x-auth-*` headers to assist debugging.
- `AUTH_TIMING_DEBUG` — when `true`, middleware emits `Server-Timing` for auth decisions.
- `NEXT_PUBLIC_APP_BASE_URL` — optional absolute origin when deploying behind a proxy. Used for
  absolute URLs in share/export flows.

## Runtime Checklist

UI requires:

- `NEXT_PUBLIC_USE_OR_PROXY=true` or `NEXT_PUBLIC_OPENROUTER_API_KEY`
- If using Anthropic models: `NEXT_PUBLIC_USE_ANTHROPIC_PROXY=true` or `NEXT_PUBLIC_ANTHROPIC_API_KEY`
- Optional defaults: `NEXT_PUBLIC_OR_ZDR_ONLY_DEFAULT`, `NEXT_PUBLIC_OR_ROUTE_PREFERENCE_DEFAULT`

Server API routes require:

- `/api/openrouter/*` and DeepResearch: `OPENROUTER_API_KEY`
- DeepResearch search: `BRAVE_SEARCH_API_KEY`
- `/api/anthropic/*` proxy: `ANTHROPIC_API_KEY`
- `/api/xai/session`: `XAI_API_KEY`
- Access gate: `AUTH_COOKIE_SECRET`, `ACCESS_CODE_PEPPER`, access code hashes

Headless scripts require:

- `OPENROUTER_API_KEY` (or `NEXT_PUBLIC_OPENROUTER_API_KEY`) for simulated student/judge models
- `ANTHROPIC_API_KEY` (or `NEXT_PUBLIC_ANTHROPIC_API_KEY`) for the default tutor model

## Build and Deployment

- Development: `bun run dev` (loads `.env.local`).
- Production build: `bun run build` → `bun start`. Copy the same env vars to the hosting provider.
- Vercel: store server-only secrets under _Environment Variables_ (Production). Do **not** define
  `NEXT_PUBLIC_OPENROUTER_API_KEY`; the proxy uses `OPENROUTER_API_KEY`.

## Security Notes

- Keep provider keys (`OPENROUTER_API_KEY`, `BRAVE_SEARCH_API_KEY`) server-side only. Do not commit
  them or expose via `NEXT_PUBLIC_*`.
- When `NEXT_PUBLIC_USE_ANTHROPIC_PROXY=true`, the `/api/anthropic/*` routes forward requests with
  the server-side `ANTHROPIC_API_KEY`. Never expose the raw Anthropic key to the client in this mode.
- Proxy mode adds CORS-friendly headers (`X-Title`, `HTTP-Referer`) inside
  `src/lib/api/openrouterClient.ts`. Update the client if new headers are required.
- Access gate secrets should be long random hex strings. Regenerate when rotating codes.
- Zero Data Retention (ZDR) lists fetch from OpenRouter. Cache them via the store (see
  `REFACTOR_PLAN.md` Phase 4); Dialogia automatically refreshes these lists every 6 hours to prevent
  stale provider/model data. Update documentation if new flags or endpoints appear.
