# State & Persistence

This document summarizes what Dialogia stores, where it is stored, and how migrations are applied.

## What Persists Where

### IndexedDB (Dexie)

Stored in `src/lib/db/*` (Dexie schema in `src/lib/db/dexie.ts`):

- **Chats** (`Chat`) — metadata and per-chat settings
- **Messages** (`Message`) — full transcript, including `Message.tutor`
- **Folders** (`Folder`) — sidebar organization
- **KV** (`KVRecord`) — small opaque values (e.g., presets, tutor profiles, decks)

Export/import flows use `exportAll`/`importAll` from `src/lib/db/index.ts`.

### Zustand Persist (UI)

The UI store persists only stable preferences (see `PersistedStoreState` in
`src/lib/store/types.ts`):

- `selectedChatId`
- `favoriteModelIds`, `hiddenModelIds`
- `ui.showSettings`, `ui.sidebarCollapsed`, `ui.zdrOnly`, `ui.routePreference`
- `ui.flags` (feature toggles)
- `ui.debug.mode`
- `ui.tutor` preferences (`contextMode`, `thesisMode`, `researchMode`, `defaultModelId`, `forceMode`)

Ephemeral UI state (streaming flags, per-message tutor attempts, search results, etc.) is not
persisted.

## Migration Strategy

- **IndexedDB schema** is versioned via `DB_SCHEMA_VERSION` in `src/lib/db/versions.ts`. Dexie
  upgrades sanitize stored messages when schema versions bump.
- **Zustand persisted state** is versioned via `STORE_MIGRATION_VERSION` in
  `src/lib/db/versions.ts` and migrated in `src/lib/store/migrations.ts`.

Backward compatibility is maintained by:

- Keeping migrations additive (convert older persisted shapes to the current UI state)
- Avoiding destructive migrations unless a new schema version is required
- Leaving ephemeral state outside persistence to reduce migration risk

## Data Flow Summary

1. Store actions update in-memory Zustand state.
2. Persistence helpers (`saveChat`, `saveMessage`, `saveFolder`, `kvGet/kvSet`) write to IndexedDB.
3. On app start, `loadRepositorySnapshot` hydrates chats/messages and rebuilds tutor UI maps.
4. Persisted UI preferences are restored via Zustand persistence + migrations.
