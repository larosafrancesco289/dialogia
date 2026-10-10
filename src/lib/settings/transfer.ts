import { exportAll, importAll } from '@/lib/db';
import { PERSISTED_STORE_KEY, useChatStore } from '@/lib/store';
import { buildPersistedState, mergePersistedState } from '@/lib/store/persistence';
import { migrate } from '@/lib/store/migrations';
import { STORE_MIGRATION_VERSION } from '@/lib/store/versions';
import { err, ok, type Result } from '@/lib/utils/result';
import { t } from '@/lib/i18n';
import { detectHistorySource } from '@/lib/historyImport/parse';
import { importHistory, type ImportProgress } from '@/lib/historyImport/importHistory';
import { looksLikeZip, readZipText } from '@/lib/historyImport/zip';

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
    const message = error instanceof Error ? error.message : t('data.exportFailed');
    return err(message);
  }
}

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
  const imported =
    chats > 0 ? t('data.imported.chats', { count: chats }) : t('data.imported.settings');
  if (skippedChats === 0) return imported;
  const skipped =
    chats > 0
      ? t('data.skipped.some', { count: skippedChats })
      : t('data.skipped.chats', { count: skippedChats });
  return `${imported} ${skipped}`;
}

/** @internal A backup's text, as `importFile` takes one. */
export async function importChatExport(
  payload: string,
): Promise<Result<{ notice: string }, string>> {
  let data: unknown;
  try {
    data = JSON.parse(payload);
  } catch {
    return err(t('data.notJson'));
  }
  return importDialogiaBackup(data);
}

/**
 * Any file Settings › Data is given: a Dialogia backup, or the
 * conversations.json of a ChatGPT or Claude export (on its own or still in
 * the export's .zip), told apart by what is in it.
 */
export async function importFile(
  file: Blob,
  options: { historyOnly?: boolean; onProgress?: (progress: ImportProgress) => void } = {},
): Promise<Result<{ notice: string }, string>> {
  let payload: string;
  if (await looksLikeZip(file)) {
    const read = await readZipText(file, 'conversations.json').catch(() => undefined);
    if (!read?.ok)
      return err(t(read?.reason === 'missing' ? 'history.zipMissing' : 'history.zipUnreadable'));
    payload = read.text;
  } else {
    payload = await file.text();
  }
  let data: unknown;
  try {
    data = JSON.parse(payload);
  } catch {
    return err(t('data.notJson'));
  }
  const source = detectHistorySource(data);
  if (source && Array.isArray(data)) return importHistory(source, data, options.onProgress);
  // Asked for chats from elsewhere, a backup (which replaces settings) is not
  // brought back without the warning its own button gives.
  if (options.historyOnly) {
    return err(t(isRecord(data) && 'chats' in data ? 'history.isBackup' : 'history.unknown'));
  }
  return importDialogiaBackup(data);
}

async function importDialogiaBackup(data: unknown): Promise<Result<{ notice: string }, string>> {
  const hasSettings = isRecord(data) && isRecord(data.persistedStore);
  const hasChats = isRecord(data) && Array.isArray(data.chats) && data.chats.length > 0;
  // Any JSON parses; one with nothing of ours in it is said to be so, not
  // reported as a success that changed nothing.
  if (!hasSettings && !hasChats) return err(t('data.nothing'));
  const version =
    isRecord(data) && typeof data.persistedStoreVersion === 'number'
      ? data.persistedStoreVersion
      : STORE_MIGRATION_VERSION;
  // Checked before anything is written: a newer build's settings are not ours
  // to guess at, and half an import is worse than none.
  if (version > STORE_MIGRATION_VERSION) {
    return err(t('data.newerVersion'));
  }
  try {
    const counts = await importAll(data as Parameters<typeof importAll>[0]);

    if (isRecord(data) && isRecord(data.persistedStore)) {
      const migrated = migrate(data.persistedStore, version);
      useChatStore.setState(mergePersistedState(useChatStore.getState(), migrated));
      await persistImportedStoreSnapshot();
    }

    const notice = describeImport({ ...counts, settings: hasSettings });
    if (!notice) return err(t('data.noneRead'));
    return ok({ notice });
  } catch (error) {
    const message = error instanceof Error ? error.message : t('data.importFailed');
    return err(message);
  }
}
