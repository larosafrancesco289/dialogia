# Dialogia Configuration

This guide lists required and optional environment variables, how proxy mode works, and the
recommended defaults for development versus production.
For architectural context, see `ARCHITECTURE.md`.

## Environment Files

Dialogia reads configuration from `.env.local`. Server-only secrets **must not** be checked into
Git. Client-visible variables must begin with `VITE_` to reach the browser, and they are **inlined
into the bundle at build time** rather than read at runtime. Server variables are read at request
time by the hosted worker, from the Cloudflare environment. `.env.example` is the authoritative
list of supported variables—copy it to `.env.local` and edit as needed.

For local development, ensure you at least set:

```
VITE_USE_OR_PROXY=true
OPENROUTER_API_KEY=sk-or-v1_server_key
```

When `VITE_USE_OR_PROXY` is `true`, the client never reads `OPENROUTER_API_KEY`. Instead, the
worker routes under `/api/openrouter/*` forward requests using the server key.

## Runtime Flags

- `VITE_HOSTED_BUILD` — builds the hosted variant: ships the `/access` route and expects
  `dist/_worker.js` to be deployed alongside the static assets. Defaults to `false`.
- `VITE_USE_OR_PROXY` — toggles proxy mode. Defaults to `false`. When `true`, all model calls
  use the server-side OpenRouter key.
- `OPENROUTER_API_KEY` — server-side key for OpenRouter. Required when proxy is enabled.
- `TAVILY_API_KEY` — enables this deployment's Tavily web search. Used only on the server.
- `VITE_TAVILY_SEARCH_ENABLED` — lets the client reach `TAVILY_API_KEY` through the gated
  `/api/tavily` proxy. BYOK users add their own Tavily key in the app instead.

There is deliberately **no client-side provider key variable**. Keys are entered by the user in
Settings › Providers and stored in a browser-local IndexedDB database (`dialogia-keys`), which
export/import never touches. A key the user supplies takes precedence over the proxy.

- `XAI_API_KEY` — server-side key for X.AI (Grok) voice sessions via `/api/xai/session`.
- `VITE_OR_ZDR_ONLY_DEFAULT` — if `true`, new sessions start with ZDR-only enforcement.
- `VITE_OR_ROUTE_PREFERENCE_DEFAULT` — optional routing hint (`balanced` | `speed` |
  `cost`). The default is `balanced`, which leaves OpenRouter's default price-weighted routing
  active. `speed` and `cost` send explicit `provider.sort` values.
- `AUTH_COOKIE_SECRET`, `ACCESS_CODE_PEPPER`, `ACCESS_CODES_INDIVIDUAL_HASHED`,
  `ACCESS_CODES_DEVELOPER_HASHED` — configure the access gate in `functions/middleware.ts` and the
  `/access` route.
- `AUTH_DEBUG_ROUTE_ENABLED` — when `true`, allows the `/api/auth/debug` route in production.
- `AUTH_DEBUG_HEADERS` — when `true`, the access gate adds `x-auth-*` headers to assist debugging.
- `AUTH_TIMING_DEBUG` — when `true`, the access gate emits `Server-Timing` for auth decisions.
- `NODE_ENV` — the gate bypasses auth only when this is explicitly `development`. An absent value
  is read as production.
- `VITE_APP_BASE_URL` — optional absolute origin when deploying behind a proxy. Used for
  absolute URLs in share/export flows.

## Rate Limiting

Dialogia uses a best-effort in-memory limiter by default. This is **per-instance only** and is not
durable across serverless invocations. For production-grade rate limiting, configure Upstash:

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

The effective `RATE_LIMIT_STRATEGY` is:

- `memory` (default, development-friendly, not shared)
- `upstash` (when both Upstash env vars are present)

## Runtime Checklist

UI requires:

- Nothing. With no provider configured the app opens its setup sheet; `VITE_USE_OR_PROXY=true`
  pre-configures the hosted deployment's key instead.
- Optional defaults: `VITE_OR_ZDR_ONLY_DEFAULT`, `VITE_OR_ROUTE_PREFERENCE_DEFAULT`

Worker API routes require:

- `/api/openrouter/*`: `OPENROUTER_API_KEY`
- `/api/tavily`: `TAVILY_API_KEY`
- `/api/xai/session`: `XAI_API_KEY`
- Access gate: `AUTH_COOKIE_SECRET`, `ACCESS_CODE_PEPPER`, access code hashes

Headless scripts require:

- `OPENROUTER_API_KEY` for simulated student/judge models

## Build and Deployment

- Development: `bun run dev` (loads `.env.local`).
- BYOK build: `bun run build` → a static `dist/`, deployable anywhere. `bun start` previews it.
- Hosted build: `bun run build:hosted` → the same `dist/` plus `dist/_worker.js`.
- Cloudflare Pages: store server-only secrets as project environment variables. Every `VITE_*`
  value is baked into the client bundle, so none of them may hold a key.

## Security Notes

- Keep provider keys (`OPENROUTER_API_KEY`, `TAVILY_API_KEY`) server-side only. Do not commit
  them or expose via `VITE_*`, which is baked into the client bundle.
- Proxy mode adds CORS-friendly headers (`X-Title`, `HTTP-Referer`) inside
  `src/lib/api/config.ts`. Update the config if new headers are required.
- Access gate secrets should be long random hex strings. Regenerate when rotating codes.
- Zero Data Retention (ZDR) lists fetch from OpenRouter and are cached in
  `src/lib/policy/zdr/cache.ts`. The refresh schedule is wired in `src/lib/services/bootstrap.ts`
  (every 6 hours) to prevent stale provider/model data. When the ZDR toggle is enabled, OpenRouter
  requests also send `provider.zdr=true` so enforcement happens per request. The ZDR policy module
  under `src/lib/policy/zdr/*` filters available models, blocks non-compliant requests when strict
  mode is active, and caches model/provider compliance status.
