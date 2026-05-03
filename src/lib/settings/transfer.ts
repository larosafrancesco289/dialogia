import { exportAll, importAll } from '@/lib/db';
import { PERSISTED_STORE_KEY, useChatStore } from '@/lib/store';
import { buildPersistedState, mergePersistedState } from '@/lib/store/persistence';
import { migrate } from '@/lib/store/migrations';
import { STORE_MIGRATION_VERSION } from '@/lib/store/versions';
import { err, ok, type Result } from '@/lib/utils/result';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

async function persistImportedStoreSnapshot() {
  const snapshot = {
    state: buildPersistedState(useChatStore.getState()),
    version: STORE_MIGRATION_VERSION,
  };
  const persistApi = (
    useChatStore as unknown as {
      persist?: {
        getOptions?: () => {
          storage?: {
            setItem?: (name: string, value: unknown) => void | Promise<void>;
          };
        };
      };
    }
  ).persist;
  const storage = persistApi?.getOptions?.().storage;
  await storage?.setItem?.(PERSISTED_STORE_KEY, snapshot);
  globalThis.localStorage?.setItem?.(PERSISTED_STORE_KEY, JSON.stringify(snapshot));
}

const buildExportFilename = (timestamp: Date): string => {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `dialogia-backup-${timestamp.getFullYear()}${pad(timestamp.getMonth() + 1)}${pad(
    timestamp.getDate(),
  )}.json`;
};

export async function buildChatExport(): Promise<
  Result<{ filename: string; json: string }, string>
> {
  try {
    const data = await exportAll();
    return ok({
      filename: buildExportFilename(new Date()),
      json: JSON.stringify(
        {
          ...data,
          persistedStore: buildPersistedState(useChatStore.getState()),
          persistedStoreVersion: STORE_MIGRATION_VERSION,
        },
        null,
        2,
      ),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Export failed';
    return err(message);
  }
}

export async function importChatExport(
  payload: string,
): Promise<Result<{ imported: true }, string>> {
  try {
    const data = JSON.parse(payload);
    await importAll(data);

    if (isRecord(data) && isRecord(data.persistedStore)) {
      const version =
        typeof data.persistedStoreVersion === 'number'
          ? data.persistedStoreVersion
          : STORE_MIGRATION_VERSION;
      const migrated = migrate(data.persistedStore, version);
      useChatStore.setState(mergePersistedState(useChatStore.getState(), migrated));
      await persistImportedStoreSnapshot();
    }

    return ok({ imported: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed';
    return err(message);
  }
}
