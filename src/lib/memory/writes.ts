// Module: memory/writes
// Responsibility: What a model's memory tool call changes, decided purely: which
// folder a name means, a note saved, replaced or forgotten, and the change that
// takes a write back. Each plan is a `MemoryChange` to apply and the `MemoryWrite`
// the reply keeps so the person can see it and undo it.

import type { MemoryChange } from '@/lib/db/repository';
import type { MemoryFolder, MemoryNote, MemoryWrite } from '@/lib/types';

type Memory = { folders: MemoryFolder[]; notes: MemoryNote[] };

export type WritePlan =
  | { ok: true; change: MemoryChange; write: MemoryWrite }
  | { ok: false; error: string; hint: string };

/** The handle a note goes by in the model's view of memory. */
export const noteHandle = (id: string) => id.slice(0, 8);

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** A folder's path from the top, "Projects/PhD thesis". */
export function folderPath(folders: MemoryFolder[], folder: MemoryFolder): string {
  const names = [folder.name];
  const seen = new Set([folder.id]);
  let parent = folders.find((f) => f.id === folder.parentId);
  while (parent && !seen.has(parent.id)) {
    names.unshift(parent.name);
    seen.add(parent.id);
    parent = folders.find((f) => f.id === parent!.parentId);
  }
  return names.join('/');
}

/** The folder a model named, by id, by path, or by a name only one folder has. */
export function resolveFolder(folders: MemoryFolder[], ref: string): MemoryFolder | undefined {
  const wanted = ref.trim().replace(/\s*[/›>]\s*/g, '/');
  if (!wanted) return undefined;
  const byId = folders.find((f) => f.id === wanted);
  if (byId) return byId;
  const byPath = folders.find((f) => same(folderPath(folders, f), wanted));
  if (byPath) return byPath;
  const byName = folders.filter((f) => same(f.name, wanted));
  return byName.length === 1 ? byName[0] : undefined;
}

/** A note the model named by its handle (or whole id); forgotten notes are out of reach. */
export function resolveNote(notes: MemoryNote[], ref: string): MemoryNote | undefined {
  const wanted = ref.trim();
  if (wanted.length < 6) return undefined;
  const matches = notes.filter((n) => n.forgottenAt === undefined && n.id.startsWith(wanted));
  return matches.length === 1 ? matches[0] : undefined;
}

export function planSave(args: {
  memory: Memory;
  folder: string;
  text: string;
  replaces?: string;
  newFolderDescription?: string;
  chatId: string;
  now: number;
  newId: () => string;
}): WritePlan {
  const { memory, now, chatId } = args;
  const text = args.text.trim();
  if (!text) {
    return { ok: false, error: 'The note is empty.', hint: 'Write the fact as a short sentence.' };
  }

  let folder = resolveFolder(memory.folders, args.folder);
  let created: MemoryFolder | undefined;
  if (!folder) {
    const parts = args.folder
      .trim()
      .replace(/\s*[/›>]\s*/g, '/')
      .split('/')
      .filter(Boolean);
    const name = parts.pop();
    const parent = parts.length ? resolveFolder(memory.folders, parts.join('/')) : undefined;
    if (!name || (parts.length && !parent)) {
      return {
        ok: false,
        error: `There is no folder "${args.folder}".`,
        hint: 'Use a folder from the memory index, or name a new one inside an existing folder.',
      };
    }
    const description = args.newFolderDescription?.trim();
    if (!description) {
      return {
        ok: false,
        error: `"${name}" would be a new folder, and a new folder needs a description.`,
        hint: 'Call again with new_folder_description: one line saying what the folder holds.',
      };
    }
    created = {
      id: args.newId(),
      name,
      description,
      createdAt: now,
      updatedAt: now,
      ...(parent ? { parentId: parent.id } : {}),
    };
    folder = created;
  }

  if (args.replaces) {
    const before = resolveNote(memory.notes, args.replaces);
    if (!before) {
      return {
        ok: false,
        error: `No note goes by "${args.replaces}".`,
        hint: 'Use a note id from memory_read or the index, or leave replaces out to add a new note.',
      };
    }
    const note: MemoryNote = {
      ...before,
      folderId: folder.id,
      text,
      author: 'model',
      updatedAt: now,
      sourceChatId: chatId,
    };
    return {
      ok: true,
      change: { notes: [note], ...(created ? { folders: [created] } : {}) },
      write: {
        noteId: note.id,
        action: 'updated',
        text,
        folderId: folder.id,
        before,
        ...(created ? { createdFolderId: created.id } : {}),
      },
    };
  }

  const note: MemoryNote = {
    id: args.newId(),
    folderId: folder.id,
    text,
    author: 'model',
    createdAt: now,
    updatedAt: now,
    sourceChatId: chatId,
  };
  return {
    ok: true,
    change: { notes: [note], ...(created ? { folders: [created] } : {}) },
    write: {
      noteId: note.id,
      action: 'added',
      text,
      folderId: folder.id,
      ...(created ? { createdFolderId: created.id } : {}),
    },
  };
}

export function planForget(args: { memory: Memory; note: string; now: number }): WritePlan {
  const before = resolveNote(args.memory.notes, args.note);
  if (!before) {
    return {
      ok: false,
      error: `No note goes by "${args.note}".`,
      hint: 'Use a note id from memory_read or the index.',
    };
  }
  return {
    ok: true,
    change: { notes: [{ ...before, forgottenAt: args.now }] },
    write: {
      noteId: before.id,
      action: 'forgotten',
      text: before.text,
      folderId: before.folderId,
      before,
    },
  };
}

/**
 * The change that takes a write back: a new note goes for good, a replaced
 * or forgotten one returns as it was, and a folder the write made goes too
 * when nothing else has come to live in it.
 */
export function undoChange(write: MemoryWrite, memory: Memory): MemoryChange {
  const folderGone =
    write.createdFolderId &&
    !memory.notes.some((n) => n.folderId === write.createdFolderId && n.id !== write.noteId) &&
    !memory.folders.some((f) => f.parentId === write.createdFolderId);
  const deleteFolderIds = folderGone ? [write.createdFolderId!] : undefined;
  if (write.action === 'added' || !write.before) {
    return { deleteNoteIds: [write.noteId], ...(deleteFolderIds ? { deleteFolderIds } : {}) };
  }
  return { notes: [write.before], ...(deleteFolderIds ? { deleteFolderIds } : {}) };
}
