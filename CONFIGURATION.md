# Dialogia Configuration

This guide lists required and optional environment variables, how proxy mode works, and the
recommended defaults for development versus production.

## Environment Files

Dialogia reads configuration from `.env.local` at runtime. Server-only secrets **must not** be
checked into Git. Client-visible variables must begin with `NEXT_PUBLIC_` to be exposed to the
browser.

For local development create `.env.local` with the proxy defaults:

```
NEXT_PUBLIC_USE_OR_PROXY=true
OPENROUTER_API_KEY=sk-or-v1_server_key
NEXT_PUBLIC_USE_ANTHROPIC_PROXY=false
ANTHROPIC_API_KEY=
NEXT_PUBLIC_ANTHROPIC_API_KEY=

# Optional integrations
BRAVE_SEARCH_API_KEY=
DEEP_RESEARCH_REASONING_ONLY=true
NEXT_PUBLIC_OR_ROUTE_PREFERENCE_DEFAULT=speed
NEXT_PUBLIC_OR_ZDR_ONLY_DEFAULT=false

# Optional access gate
AUTH_COOKIE_SECRET=
ACCESS_CODE_PEPPER=
ACCESS_CODES_HASHED=
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
- `DEEP_RESEARCH_REASONING_ONLY` — defaults to `true`. Forces the DeepResearch agent to pick models
  that advertise reasoning support; set to `false` to allow experimental providers during testing.
  DeepResearch always executes with the server-side `OPENROUTER_API_KEY`.
- `NEXT_PUBLIC_OR_ZDR_ONLY_DEFAULT` — if `true`, new sessions start with ZDR-only enforcement.
- `NEXT_PUBLIC_OR_ROUTE_PREFERENCE_DEFAULT` — optional routing hint (`speed` | `cost`).
- `AUTH_COOKIE_SECRET`, `ACCESS_CODE_PEPPER`, `ACCESS_CODES_HASHED` — configure the access gate in
  `middleware.ts` and `app/access` routes.
- `NEXT_PUBLIC_APP_BASE_URL` — optional absolute origin when deploying behind a proxy. Used for
  absolute URLs in share/export flows.

## Build and Deployment

- Development: `npm run dev` (loads `.env.local`).
- Production build: `npm run build` → `npm start`. Copy the same env vars to the hosting provider.
- Vercel: store server-only secrets under *Environment Variables* (Production). Do **not** define
  `NEXT_PUBLIC_OPENROUTER_API_KEY`; the proxy uses `OPENROUTER_API_KEY`.

## Security Notes

- Keep provider keys (`OPENROUTER_API_KEY`, `BRAVE_SEARCH_API_KEY`) server-side only. Do not commit
  them or expose via `NEXT_PUBLIC_*`.
- When `NEXT_PUBLIC_USE_ANTHROPIC_PROXY=true`, the `/api/anthropic/*` routes forward requests with
  the server-side `ANTHROPIC_API_KEY`. Never expose the raw Anthropic key to the client in this mode.
- Proxy mode adds CORS-friendly headers (`X-Title`, `HTTP-Referer`) inside
  `src/lib/api/openrouterClient.ts`. Update the client if new headers are required.
- Access gate secrets should be long random hex strings. Regenerate when rotating codes.
- Zero Data Retention (ZDR) lists fetch from OpenRouter. Cache them via the store (see Phase 4 of
  the refactor plan) and update documentation if new flags or endpoints appear.
