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
- `TAVILY_API_KEY` — enables local Tavily web search. Used only on the server.
- `XAI_API_KEY` — server-side key for X.AI (Grok) voice sessions via `/api/xai/session`.
- `NEXT_PUBLIC_OR_ZDR_ONLY_DEFAULT` — if `true`, new sessions start with ZDR-only enforcement.
- `NEXT_PUBLIC_OR_ROUTE_PREFERENCE_DEFAULT` — optional routing hint (`balanced` | `speed` |
  `cost`). The default is `balanced`, which leaves OpenRouter's default price-weighted routing
  active. `speed` and `cost` send explicit `provider.sort` values.
- `AUTH_COOKIE_SECRET`, `ACCESS_CODE_PEPPER`, `ACCESS_CODES_INDIVIDUAL_HASHED`,
  `ACCESS_CODES_DEVELOPER_HASHED` — configure the access gate in `middleware.ts` and `app/access`
  routes.
- `AUTH_DEBUG_ROUTE_ENABLED` — when `true`, allows the `/api/auth/debug` route in production.
- `AUTH_DEBUG_HEADERS` — when `true`, middleware adds `x-auth-*` headers to assist debugging.
- `AUTH_TIMING_DEBUG` — when `true`, middleware emits `Server-Timing` for auth decisions.
- `NEXT_PUBLIC_APP_BASE_URL` — optional absolute origin when deploying behind a proxy. Used for
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

- `NEXT_PUBLIC_USE_OR_PROXY=true` or `NEXT_PUBLIC_OPENROUTER_API_KEY`
- Optional defaults: `NEXT_PUBLIC_OR_ZDR_ONLY_DEFAULT`, `NEXT_PUBLIC_OR_ROUTE_PREFERENCE_DEFAULT`

Server API routes require:

- `/api/openrouter/*`: `OPENROUTER_API_KEY`
- `/api/tavily`: `TAVILY_API_KEY`
- `/api/xai/session`: `XAI_API_KEY`
- Access gate: `AUTH_COOKIE_SECRET`, `ACCESS_CODE_PEPPER`, access code hashes

Headless scripts require:

- `OPENROUTER_API_KEY` (or `NEXT_PUBLIC_OPENROUTER_API_KEY`) for simulated student/judge models

## Build and Deployment

- Development: `bun run dev` (loads `.env.local`).
- Production build: `bun run build` → `bun start`. Copy the same env vars to the hosting provider.
- Vercel: store server-only secrets under _Environment Variables_ (Production). Do **not** define
  `NEXT_PUBLIC_OPENROUTER_API_KEY`; the proxy uses `OPENROUTER_API_KEY`.

## Security Notes

- Keep provider keys (`OPENROUTER_API_KEY`, `TAVILY_API_KEY`) server-side only. Do not commit
  them or expose via `NEXT_PUBLIC_*`.
- Proxy mode adds CORS-friendly headers (`X-Title`, `HTTP-Referer`) inside
  `src/lib/api/config.ts`. Update the config if new headers are required.
- Access gate secrets should be long random hex strings. Regenerate when rotating codes.
- Zero Data Retention (ZDR) lists fetch from OpenRouter and are cached in
  `src/lib/policy/zdr/cache.ts`. The refresh schedule is wired in `src/lib/services/bootstrap.ts`
  (every 6 hours) to prevent stale provider/model data. When the ZDR toggle is enabled, OpenRouter
  requests also send `provider.zdr=true` so enforcement happens per request.
