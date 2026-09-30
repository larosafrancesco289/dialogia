// Module: memory/notebook
// Responsibility: Pure rules for long-term memory's folders and notes: the folders
// every memory has, how long a forgotten note waits, and how a folder is counted.

import {
  MEMORY_ABOUT_FOLDER_ID,
  MEMORY_LEARNING_FOLDER_ID,
  type MemoryFolder,
  type MemoryNote,
} from '@/lib/types';

/** How long a forgotten note waits in Recently forgotten before it is gone. */
export const FORGOTTEN_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const BUILT_IN_FOLDERS: Pick<MemoryFolder, 'id' | 'name' | 'description'>[] = [
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
