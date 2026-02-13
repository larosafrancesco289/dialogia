import { clearAllStudyStorage, getStudySession, saveStudySession } from './storage';
import { endSession } from './logger';
import { copyStudyLogToClipboard } from './export';

const INDEXED_DB_NAMES = ['dialogia-chats', 'dialogia-messages', 'dialogia'];
const LOCAL_STORAGE_PREFIXES = ['dialogia-ui', 'dialogia-study'];

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

async function closeOpenDbConnections(): Promise<void> {
  if (!isBrowser()) return;
  try {
    const { db } = await import('@/lib/db');
    (db as { close?: () => void }).close?.();
  } catch {
    // Best effort: continue even if DB module fails to load.
  }
}

function deleteDatabase(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.deleteDatabase(name);
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };

    request.onsuccess = () => finish(resolve);
    request.onerror = () =>
      finish(() => reject(request.error || new Error(`Failed to delete database "${name}".`)));
    request.onblocked = () => {
      window.setTimeout(() => {
        finish(() =>
          reject(
            new Error(
              `Database "${name}" is blocked. Close other Dialogia tabs/windows and retry.`,
            ),
          ),
        );
      }, 1500);
    };
  });
}

async function clearIndexedDB(): Promise<void> {
  if (!isBrowser()) return;
  await closeOpenDbConnections();

  const databases = await window.indexedDB.databases?.();
  const targets = new Set<string>();
  if (databases) {
    for (const db of databases) {
      if (db.name && INDEXED_DB_NAMES.some((name) => db.name?.includes(name))) {
        targets.add(db.name);
      }
    }
  }

  if (targets.size === 0) {
    for (const name of INDEXED_DB_NAMES) {
      targets.add(name);
    }
  }

  await Promise.all(Array.from(targets).map((name) => deleteDatabase(name)));
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
    const result = await copyStudyLogToClipboard({ scope: 'full_session' });
    if (!result.success) {
      if (sessionSnapshot) saveStudySession(sessionSnapshot);
      const message = result.error || 'Clipboard access denied';
      window.alert(`Copy failed: ${message}. Reset cancelled so data is preserved.`);
      return;
    }
  }

  try {
    await clearIndexedDB();
    clearAllStudyStorage();
    clearLocalStorageByPrefix();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown reset error';
    window.alert(`Reset failed: ${message}`);
    return;
  }

  window.location.reload();
}

export async function clearAllAppData(): Promise<void> {
  clearLocalStorageByPrefix();
  await clearIndexedDB();
}
