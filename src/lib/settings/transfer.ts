import { exportAll, importAll, repository } from '@/lib/db';
import { sanitizeMemoryNote } from '@/lib/db/sanitize';
import { hasKey } from '@/lib/keys/store';
import { guardImportedEndpoints } from '@/lib/store/endpointSlice';
import type { MemoryNote } from '@/lib/types';
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

/**
 * The backup as JSON in pieces, a row at a time, so no one string has to hold
 * every chat: a history with attachments can outgrow the longest string a
 * browser will build.
 */
function jsonPieces(data: Record<string, unknown>): string[] {
  const pieces: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    pieces.push(`${pieces.length ? ',' : '{'}${JSON.stringify(key)}:`);
    if (!Array.isArray(value)) {
      pieces.push(JSON.stringify(value));
      continue;
    }
    pieces.push('[');
    value.forEach((row, i) => pieces.push(`${i ? ',' : ''}${JSON.stringify(row ?? null)}`));
    pieces.push(']');
  }
  pieces.push(pieces.length ? '}' : '{}');
  return pieces;
}

export async function buildChatExport(): Promise<Result<{ filename: string; blob: Blob }, string>> {
  try {
    const data = await exportAll();
    const pieces = jsonPieces({
      ...data,
      persistedStore: buildPersistedState(useChatStore.getState()),
      persistedStoreVersion: STORE_MIGRATION_VERSION,
    });
    return ok({
      filename: buildExportFilename(new Date()),
      blob: new Blob(pieces, { type: 'application/json' }),
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

type Applied = Result<{ notice: string }, string>;

/** What a backup would set that the person should see before it does. */
export type ImportReview = {
  /** The instruction every new chat would start with, when the file changes it. */
  system?: string;
  /** Memory notes the file adds or rewrites. */
  notes: string[];
};

/** A file read and checked, waiting for the person's yes. */
export type PreparedImport = {
  review: ImportReview;
  apply: (onProgress?: (progress: ImportProgress) => void) => Promise<Applied>;
};

/** @internal A backup's text, read and applied at once. */
export async function importChatExport(payload: string): Promise<Applied> {
  let data: unknown;
  try {
    data = JSON.parse(payload);
  } catch {
    return err(t('data.notJson'));
  }
  const prepared = await prepareBackup(data);
  return prepared.ok ? prepared.prepared.apply() : prepared;
}

/** @internal Read and apply a file at once, as the Data panel does after its question. */
export async function importFile(
  file: Blob,
  options: { historyOnly?: boolean; onProgress?: (progress: ImportProgress) => void } = {},
): Promise<Applied> {
  const prepared = await prepareImport(file, options);
  return prepared.ok ? prepared.prepared.apply(options.onProgress) : prepared;
}

/**
 * Any file Settings › Data is given, read and checked but not yet applied: a
 * Dialogia backup, or the conversations.json of a ChatGPT or Claude export
 * (on its own or still in the export's .zip), told apart by what is in it.
 */
export async function prepareImport(
  file: Blob,
  options: { historyOnly?: boolean } = {},
): Promise<Result<{ prepared: PreparedImport }, string>> {
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
  if (source && Array.isArray(data)) {
    // Chats and their messages only: an export from elsewhere never sets
    // settings, servers or memory.
    return ok({
      prepared: {
        review: { notes: [] },
        apply: (onProgress) => importHistory(source, data as unknown[], onProgress),
      },
    });
  }
  // Asked for chats from elsewhere, a backup (which replaces settings) is not
  // brought back without the warning its own button gives.
  if (options.historyOnly) {
    return err(t(isRecord(data) && 'chats' in data ? 'history.isBackup' : 'history.unknown'));
  }
  return prepareBackup(data);
}

async function prepareBackup(data: unknown): Promise<Result<{ prepared: PreparedImport }, string>> {
  const hasSettings = isRecord(data) && isRecord(data.persistedStore);
  const hasChats = isRecord(data) && Array.isArray(data.chats) && data.chats.length > 0;
  // Any JSON parses; one with nothing of ours in it is said to be so, not
  // reported as a success that changed nothing.
  if (!isRecord(data) || (!hasSettings && !hasChats)) return err(t('data.nothing'));
  const version =
    typeof data.persistedStoreVersion === 'number'
      ? data.persistedStoreVersion
      : STORE_MIGRATION_VERSION;
  // Checked before anything is written: a newer build's settings are not ours
  // to guess at, and half an import is worse than none.
  if (version > STORE_MIGRATION_VERSION) {
    return err(t('data.newerVersion'));
  }
  const migrated = isRecord(data.persistedStore)
    ? migrate(data.persistedStore, version)
    : undefined;
  const local = await repository.loadMemory().catch(() => undefined);
  const localNotes = new Map((local?.notes ?? []).map((note) => [note.id, note]));
  const unchanged = (note: MemoryNote) => localNotes.get(note.id)?.text === note.text;
  const incoming = (Array.isArray(data.memoryNotes) ? data.memoryNotes : [])
    .map(sanitizeMemoryNote)
    .filter((note): note is MemoryNote => !!note);

  const system = migrated?.ui?.chatDefaults?.system?.trim();
  const currentSystem = useChatStore.getState().ui.chatDefaults?.system?.trim();
  const review: ImportReview = {
    system: system && system !== currentSystem ? system : undefined,
    notes: incoming.filter((note) => !note.forgottenAt && !unchanged(note)).map((n) => n.text),
  };

  const apply = async (): Promise<Applied> => {
    try {
      // Words this browser did not see written are not the person's: only a
      // note that is already here, word for word as theirs, stays theirs.
      const memoryNotes = incoming.map((note) =>
        unchanged(note) && localNotes.get(note.id)?.author === 'user'
          ? note
          : { ...note, author: 'model' as const },
      );
      const counts = await importAll({ ...data, memoryNotes } as Parameters<typeof importAll>[0]);

      if (migrated) {
        const state = useChatStore.getState();
        const safe = {
          ...migrated,
          customEndpoints: guardImportedEndpoints(
            migrated.customEndpoints,
            state.customEndpoints,
            hasKey,
          ),
        };
        useChatStore.setState(mergePersistedState(state, safe));
        await persistImportedStoreSnapshot();
      }

      const notice = describeImport({ ...counts, settings: hasSettings });
      if (!notice) return err(t('data.noneRead'));
      return ok({ notice });
    } catch (error) {
      const message = error instanceof Error ? error.message : t('data.importFailed');
      return err(message);
    }
  };
  return ok({ prepared: { review, apply } });
}
