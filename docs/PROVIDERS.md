# Providers

## Active

- OpenRouter: primary model transport for chat completions and model metadata.
- Anthropic: direct Claude transport with proxy routes, model loading, streaming, tool conversion,
  reasoning/thinking support, web-search tool support, and prompt-cache breakpoints.
- Tavily: server-side web search tool used by `web_search`.

## Planned / placeholders

- X.AI: API proxy route exists but is not wired into model transport yet.

## Adding a provider (high level)

- Extend `ModelTransport` in `src/lib/transport/models.ts`.
- Add provider adapter under `src/lib/<provider>` and `app/api/<provider>`.
- Wire auth in `src/lib/auth/require.ts` and `src/lib/auth/transport.ts`.
- Update routing/policy in `src/lib/policy/*` as needed.
