// Module: memory/notebook
// Responsibility: Pure rules for long-term memory's folders and notes: which chats
// have memory, the folders every memory has, how long a forgotten note waits, what
// a load mends, and how a folder is counted.

import type { UiSnapshot } from '@/lib/contracts/ui';
import {
  MEMORY_ABOUT_FOLDER_ID,
  MEMORY_LEARNING_FOLDER_ID,
  type Chat,
  type MemoryFolder,
  type MemoryNote,
} from '@/lib/types';

/** The Memory page's Recently forgotten, which is not a folder. */
export const FORGOTTEN_PAGE = 'forgotten';

/**
 * The chat's own switch, the bookmark in its composer. Off keeps the chat out of
 * memory altogether: the model has none there, and no other chat is shown it.
 */
export const chatAllowsMemory = (chat: Pick<Chat, 'settings'>) =>
  chat.settings.features?.memory?.enabled !== false;

/** Whether the model has memory in this chat: on everywhere, and not switched off in the chat. */
export const memoryOnInChat = (
  ui: Pick<UiSnapshot, 'memoryEnabled'> | undefined,
  chat: Pick<Chat, 'settings'>,
) => ui?.memoryEnabled !== false && chatAllowsMemory(chat);

/** How long a forgotten note waits in Recently forgotten before it is gone. */
export const FORGOTTEN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export const BUILT_IN_FOLDERS: Pick<MemoryFolder, 'id' | 'name' | 'description'>[] = [
  {
    id: MEMORY_ABOUT_FOLDER_ID,
    name: 'About you',
    description: 'Who you are, where you live, how you like answers',
  },
  {
    id: MEMORY_LEARNING_FOLDER_ID,
    name: 'Learning',
    description: 'What you have studied with the tutor, and how you learn best',
  },
];

/** The built-in folders memory is missing, ready to save. */
export function missingBuiltInFolders(folders: MemoryFolder[], now: number): MemoryFolder[] {
  const have = new Set(folders.map((folder) => folder.id));
  return BUILT_IN_FOLDERS.filter((folder) => !have.has(folder.id)).map((folder) => ({
    ...folder,
    createdAt: now,
    updatedAt: now,
  }));
}

/**
 * The rows memory needs mended to be read at all: a folder whose parent is
 * missing, or which sits inside itself, goes to the top level, and a note
 * whose folder is missing goes to About you. Empty when nothing needs it.
 */
export function repairs(
  folders: MemoryFolder[],
  notes: MemoryNote[],
): { folders: MemoryFolder[]; notes: MemoryNote[] } {
  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  const inItself = (folder: MemoryFolder) => {
    let at = folder.parentId ? byId.get(folder.parentId) : undefined;
    for (let steps = 0; at && steps < byId.size; steps += 1) {
      if (at.id === folder.id) return true;
      at = at.parentId ? byId.get(at.parentId) : undefined;
    }
    return false;
  };
  return {
    folders: folders
      .filter((f) => f.parentId !== undefined && (!byId.has(f.parentId) || inItself(f)))
      .map(({ parentId: _parentId, ...folder }) => folder),
    notes: notes
      .filter((note) => !byId.has(note.folderId))
      .map((note) => ({ ...note, folderId: MEMORY_ABOUT_FOLDER_ID })),
  };
}

/** The folder a note goes back to: its own while that folder is there, or else About you. */
export const returningFolder = (folders: MemoryFolder[], folderId: string) =>
  folders.some((folder) => folder.id === folderId) ? folderId : MEMORY_ABOUT_FOLDER_ID;

/**
 * The Memory page a note is on now, since it may have moved or been forgotten:
 * its folder, Recently forgotten, or `fallback` once the note is gone.
 */
export function pageOfNote(
  notes: MemoryNote[],
  noteId: string,
  fallback?: string,
): string | undefined {
  const note = notes.find((n) => n.id === noteId);
  if (!note) return fallback;
  return note.forgottenAt !== undefined ? FORGOTTEN_PAGE : note.folderId;
}

/** Forgotten notes whose wait is over. */
export function expiredNotes(notes: MemoryNote[], now: number): MemoryNote[] {
  return notes.filter(
    (note) => note.forgottenAt !== undefined && now - note.forgottenAt >= FORGOTTEN_RETENTION_MS,
  );
}

/**
 * Folders in reading order: the built-in ones first, then the rest by name,
 * each followed by its own subfolders, with their depth.
 */
export function orderedFolders(folders: MemoryFolder[]): { folder: MemoryFolder; depth: number }[] {
  const builtInRank = (id: string) => {
    const rank = BUILT_IN_FOLDERS.findIndex((folder) => folder.id === id);
    return rank === -1 ? BUILT_IN_FOLDERS.length : rank;
  };
  const byOrder = (a: MemoryFolder, b: MemoryFolder) =>
    builtInRank(a.id) - builtInRank(b.id) || a.name.localeCompare(b.name);
  const ids = new Set(folders.map((folder) => folder.id));
  const out: { folder: MemoryFolder; depth: number }[] = [];
  const visit = (parentId: string | undefined, depth: number) => {
    folders
      .filter((folder) =>
        parentId === undefined
          ? !folder.parentId || !ids.has(folder.parentId)
          : folder.parentId === parentId,
      )
      .sort(byOrder)
      .forEach((folder) => {
        out.push({ folder, depth });
        visit(folder.id, depth + 1);
      });
  };
  visit(undefined, 0);
  return out;
}

/** A folder's own subfolders, in reading order. */
export const subfoldersOf = (folders: MemoryFolder[], folderId: string): MemoryFolder[] =>
  orderedFolders(folders)
    .map(({ folder }) => folder)
    .filter((folder) => folder.parentId === folderId);

/** Notes kept in a folder, oldest first: forgotten ones are left out. */
export function notesIn(notes: MemoryNote[], folderId: string): MemoryNote[] {
  return notes
    .filter((note) => note.folderId === folderId && note.forgottenAt === undefined)
    .sort((a, b) => a.createdAt - b.createdAt);
}

/** Notes waiting in Recently forgotten, most recently forgotten first. */
export function forgottenNotes(notes: MemoryNote[]): MemoryNote[] {
  return notes
    .filter((note) => note.forgottenAt !== undefined)
    .sort((a, b) => (b.forgottenAt ?? 0) - (a.forgottenAt ?? 0));
}
