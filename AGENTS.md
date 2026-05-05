# Repository Guidelines

## Project Structure & Module Organization

- Next.js App Router lives in `app/` (layouts, pages, middleware).
- Source modules in `src/`: `components/` (PascalCase .tsx), `lib/` (API, state, utilities), `data/`, `types/`.
- Static files in `public/`; screenshots and docs images in `assets/`.
- Styles in `styles/`.
- Tests in `tests/` and colocated `src/**/*.test.ts(x)`.
- Path aliases: `@/components/*`, `@/lib/*`, `@/data/*` (see `tsconfig.json`).
- API proxy routes under `app/api/*` (OpenRouter, Tavily, X.AI, auth). See ARCHITECTURE.md.

## Build, Test, and Development Commands

- Use Bun (packageManager `bun@1.3.2`). Install deps with `bun install`.
- Dev: `bun run dev` (http://localhost:3000). Wrapper: `scripts/dev.sh`.
- Build: `bun run build`. Wrapper: `scripts/build.sh`.
- Start (prod): `bun start`. Wrapper: `scripts/start.sh`.
- Tests: `bun run test` (tsx test runner over `tests/**/*.test.ts` and `src/**/*.test.ts`).
- Type check: `bun run lint:types`.
- Format: `bun run format` (Prettier).
- CI: `scripts/ci.sh` (runs lint:types, test, format).
- Tutor simulation: `bun run tutor:simulate` (headless tutor pipeline).
- Ablation: `bun run ablation` (evaluation script).

## Coding Style & Naming Conventions

- Language: TypeScript, React 18, Next.js App Router.
- Prettier (`.prettierrc`): single quotes, semicolons, trailing commas=all, width=100.
- Components: PascalCase filenames in `src/components/` with named exports.
- Functions/variables: `camelCase`; constants `SCREAMING_SNAKE_CASE` when global.
- Imports: prefer path aliases (e.g., `import X from '@/lib/foo'`).

## Testing Guidelines

- Use the tsx test runner; name files `*.test.ts` or `*.test.tsx`.
- Place fast unit tests near the code or in `tests/` for integration.
- Avoid network calls; test pure logic in `src/lib/*`. Stub fetch where needed.
- Aim to cover state selectors, request builders, and render behavior of key components.

## Commit & Pull Request Guidelines

- Commits: imperative, concise subjects; optional scope. Example: "Refactor agent types and modularize message card styles".
- PRs must include: clear description, rationale, linked issues, screenshots/GIFs for UI, and notes on env/config.
- Before pushing: `bun run lint:types && bun run test && bun run format`.

## Security & Configuration Tips

- Prefer proxy mode (`NEXT_PUBLIC_USE_OR_PROXY=true`); keep keys server-side in `.env.local`.
- Never commit secrets; avoid `NEXT_PUBLIC_*` for sensitive values.
- See CONFIGURATION.md for required env vars and access-gate setup.

## Agent-Specific Instructions

- Make minimal, focused changes; avoid broad renames.
- Respect existing structure/naming; update README/ARCHITECTURE.md if APIs or flows change.
- Validate with type-checks and tests before requesting review.
