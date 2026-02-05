import { clearAllStudyStorage, getStudySession, saveStudySession } from './storage';
import { endSession } from './logger';
import { copyStudyLogToClipboard } from './export';

const INDEXED_DB_NAMES = ['dialogia-chats', 'dialogia-messages', 'dialogia'];
const LOCAL_STORAGE_PREFIXES = ['dialogia-ui', 'dialogia-study'];

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

async function clearIndexedDB(): Promise<void> {
  if (!isBrowser()) return;

  const databases = await window.indexedDB.databases?.();
  if (databases) {
    for (const db of databases) {
      if (db.name && INDEXED_DB_NAMES.some((name) => db.name?.includes(name))) {
        window.indexedDB.deleteDatabase(db.name);
      }
    }
  } else {
    for (const name of INDEXED_DB_NAMES) {
      window.indexedDB.deleteDatabase(name);
    }
  }
}

function clearLocalStorageByPrefix(): void {
  if (!isBrowser()) return;

  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach((key) => localStorage.removeItem(key));
}

export type ResetOptions = {
  exportBeforeReset?: boolean;
};

export async function resetForNextParticipant(options: ResetOptions = {}): Promise<void> {
  const { exportBeforeReset = true } = options;

  const sessionSnapshot = exportBeforeReset ? getStudySession() : null;

  endSession();

  if (exportBeforeReset) {
    const result = await copyStudyLogToClipboard();
    if (!result.success) {
      if (sessionSnapshot) saveStudySession(sessionSnapshot);
      const message = result.error || 'Clipboard access denied';
      window.alert(`Copy failed: ${message}. Reset cancelled so data is preserved.`);
      return;
    }
  }

  clearAllStudyStorage();
  clearLocalStorageByPrefix();
  await clearIndexedDB();

  window.location.reload();
}

export async function clearAllAppData(): Promise<void> {
  clearLocalStorageByPrefix();
  await clearIndexedDB();
}
