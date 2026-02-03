# Conventions

## Naming

- Directories: `kebab-case` for multi-word folders (e.g., `message-panel`, `turn-runtime`).
- Components: PascalCase filenames under `src/components/` with named exports.
- Functions/variables: `camelCase`; global constants `SCREAMING_SNAKE_CASE`.

## Runtime Boundaries

- `*.client.ts(x)` browser-only (DOM/Web APIs allowed).
- `*.server.ts` server-only (Node/Next server APIs) and must import `server-only`.
- `*.edge.ts` edge-only (WebCrypto, Next middleware APIs).
- `*.shared.ts` environment-neutral (no Node/DOM/Next server imports).

## Imports

- Prefer alias imports (`@/components/*`, `@/lib/*`, `@/data/*`, `@/tooling/*`).
- Import only a domain’s public surface (`src/lib/<domain>/index.ts`) where available.
- UI components must not import server-only modules (files ending in `.server.ts`).
