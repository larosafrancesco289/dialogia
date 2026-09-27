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

const NOTHING_TO_IMPORT = 'This file has no Dialogia chats or settings.';

const chatCount = (n: number) => `${n} ${n === 1 ? 'chat' : 'chats'}`;

/** @internal What an import brought in, in words; `undefined` when it brought in nothing. */
export function describeImport({
  chats,
  skippedChats,
  settings,
}: {
  chats: number;
  skippedChats: number;
  settings: boolean;
}): string | undefined {
  if (chats === 0 && !settings) return undefined;
  const imported = chats > 0 ? `Imported ${chatCount(chats)}.` : 'Imported your settings.';
  if (skippedChats === 0) return imported;
  const skipped = chats > 0 ? `${skippedChats}` : chatCount(skippedChats);
  return `${imported} ${skipped} could not be read.`;
}

export async function importChatExport(
  payload: string,
): Promise<Result<{ notice: string }, string>> {
  let data: unknown;
  try {
    data = JSON.parse(payload);
  } catch {
    return err('That file is not a Dialogia export: it is not valid JSON.');
  }
  const hasSettings = isRecord(data) && isRecord(data.persistedStore);
  const hasChats = isRecord(data) && Array.isArray(data.chats) && data.chats.length > 0;
  // Any JSON parses; one with nothing of ours in it is said to be so, not
  // reported as a success that changed nothing.
  if (!hasSettings && !hasChats) return err(NOTHING_TO_IMPORT);
  const version =
    isRecord(data) && typeof data.persistedStoreVersion === 'number'
      ? data.persistedStoreVersion
      : STORE_MIGRATION_VERSION;
  // Checked before anything is written: a newer build's settings are not ours
  // to guess at, and half an import is worse than none.
  if (version > STORE_MIGRATION_VERSION) {
    return err(
      'This backup was made by a newer version of Dialogia. Reload to update the app, then import it again.',
    );
  }
  try {
    const counts = await importAll(data as Parameters<typeof importAll>[0]);

    if (isRecord(data) && isRecord(data.persistedStore)) {
      const migrated = migrate(data.persistedStore, version);
      useChatStore.setState(mergePersistedState(useChatStore.getState(), migrated));
      await persistImportedStoreSnapshot();
    }

    const notice = describeImport({ ...counts, settings: hasSettings });
    if (!notice) return err('None of the chats in this file could be read.');
    return ok({ notice });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed';
    return err(message);
  }
}
