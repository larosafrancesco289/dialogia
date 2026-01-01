# Golden Path: Common Extensions

Short, practical guide for extending Dialogia without violating module boundaries.

## UI imports allowed

- Allowed: `src/lib/store/*` (selectors/actions), `src/lib/ui/*`, `src/lib/hooks/*`, and UI-safe
  helpers under `src/lib/messages/*`.
- Avoid: `src/lib/api/*`, `src/lib/openrouter/*`, `src/lib/transport/*`, `src/lib/eval/*`, and
  `src/lib/headless/*` in UI components.

## Add a tool

1. Define or update a zod schema under `src/lib/schemas/*` for the tool payload.
2. Define the tool schema under `src/lib/agent/tools/definitions/` using `toJsonSchema(...)`
   (export a `ToolDefinition`).
3. Re-export it from `src/lib/agent/tools/definitions/tutorTools.ts` or a new definitions entrypoint.
4. Add the tool name to `TUTOR_TOOL_NAMES` or `TOOL_NAMES` in `src/lib/agent/types.ts`.
5. Add metadata in `src/lib/agent/tools/metadata.ts` for category/tags.
6. Implement a handler:
   - Tutor tools: add handler under `src/lib/agent/tools/tutor/handlers/` and register it in
     `src/lib/agent/tools/tutor.ts`.
   - Other tools: add handler in the relevant module (e.g., `src/lib/agent/tools/web.ts`) and
     route it through `src/lib/agent/tools/router.ts` or `src/lib/agent/tools/exec.ts`.
7. Wire it into planning/streaming if needed (`src/lib/agent/planning.ts`,
   `src/lib/agent/planning/*`, `src/lib/agent/streaming.ts`).
8. Add tests next to the handler or under `tests/`.

## Add a provider

1. Implement a new `TransportClient` under `src/lib/transport/*` or a provider module.
2. Extend `ModelTransport` in `src/lib/types/models.ts`.
3. Register the client in `src/lib/transport/registry.ts`.
4. Add provider/model metadata in `src/data/curatedModels.ts` and helpers in
   `src/lib/models.ts` as needed.
5. Keep shared contracts in `src/lib/transport/models.ts` and `src/lib/transport/completions.ts`.
6. Update request building in the provider adapter (e.g., `src/lib/openrouter/request.ts`) and keep
   `src/lib/agent/request.ts` focused on plugin selection.
7. Add a proxy route under `app/api/` if keys must stay server-side.
8. Document env keys in `CONFIGURATION.md` and add contract tests in `tests/`.

## Add a settings panel

1. Create the panel component under `src/components/settings/sections/`.
2. Add tab/section labels in `src/components/settings/sections/config.ts`.
3. Render the panel in `src/components/settings/SettingsDrawer.tsx`.
4. Use `SettingsSection` for layout and store selectors/actions for state.
5. Add tests if you introduce non-trivial logic.

## Add a store slice

1. Add a slice module in `src/lib/store/*Slice.ts` with state + actions.
2. Update `src/lib/store/stateTypes.ts` and `src/lib/store/actionsTypes.ts`.
3. Compose the slice in `src/lib/store/index.ts` and update `PersistedStoreState` if persisted.
4. Add selectors in `src/lib/store/selectors.ts` for derived state.
5. Add migrations in `src/lib/store/migrations.ts` when the persisted shape changes.
6. Add tests under `tests/` for migrations/selectors.
