# Providers

## Active

- OpenRouter: primary model transport for chat completions and model metadata.
- Brave Search: web search tool used by `web_search` and DeepResearch.

## Planned / placeholders

- X.AI: API proxy route exists but is not wired into model transport yet.
- Anthropic: no implementation yet; placeholder directories were removed.

## Adding a provider (high level)

- Extend `ModelTransport` in `src/lib/transport/models.ts`.
- Add provider adapter under `src/lib/<provider>` and `app/api/<provider>`.
- Wire auth in `src/lib/auth/require.ts` and `src/lib/auth/transport.ts`.
- Update routing/policy in `src/lib/policy/*` as needed.
