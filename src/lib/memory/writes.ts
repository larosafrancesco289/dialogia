// Module: memory/writes
// Responsibility: What a model's memory tool call changes, decided purely: which
// folder a name means, a note saved, replaced or forgotten, and the change that
// takes a write back while the note is as the write left it. Each plan is a
// `MemoryChange` to apply and the `MemoryWrite` the reply keeps so the person can
// see it and undo it.

import type { MemoryChange } from '@/lib/db/repository';
import { returningFolder } from '@/lib/memory/notebook';
import {
  MEMORY_ABOUT_FOLDER_ID,
  type MemoryFolder,
  type MemoryNote,
  type MemoryWrite,
  type Message,
  type MessageToolRound,
} from '@/lib/types';

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

/** A folder path as a model may write it ("Projects › PhD thesis"), in its parts. */
const pathParts = (ref: string) =>
  ref
    .trim()
    .replace(/\s*[/›>]\s*/g, '/')
    .split('/')
    .filter(Boolean);

/**
 * Where a new folder named by a path would go: its name, and the folder it
 * goes inside, which must be there already. Undefined when it cannot go anywhere.
 */
export function newFolderPlace(
  folders: MemoryFolder[],
  ref: string,
): { name: string; parent?: MemoryFolder } | undefined {
  const parts = pathParts(ref);
  const name = parts.pop();
  if (!name) return undefined;
  if (!parts.length) return { name };
  const parent = resolveFolder(folders, parts.join('/'));
  return parent ? { name, parent } : undefined;
}

/** The folder a model named, by id, by path, or by a name only one folder has. */
export function resolveFolder(folders: MemoryFolder[], ref: string): MemoryFolder | undefined {
  const wanted = pathParts(ref).join('/');
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

/** A live note that already says this, word for word: saving it again would only copy it. */
export function alreadySaved(notes: MemoryNote[], text: string): MemoryNote | undefined {
  const words = (s: string) => s.replace(/[.\s]+$/, '');
  return notes.find(
    (note) => note.forgottenAt === undefined && same(words(note.text), words(text)),
  );
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
    const place = newFolderPlace(memory.folders, args.folder);
    if (!place) {
      return {
        ok: false,
        error: `There is no folder "${args.folder}".`,
        hint: 'Use a folder from the memory index, or name a new one inside an existing folder.',
      };
    }
    const { name, parent } = place;
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
 * The change that takes a write back, or undefined when the note is no longer
 * as the write left it (a later write, the person's edit, consolidation), so
 * nothing newer is lost. A new note is forgotten, and waits in Recently
 * forgotten; a replaced or forgotten one returns as it was. A folder the write
 * made goes too when nothing else is in it. No note is left in a folder that is
 * gone: one forgotten out of it moves to the folder above, and one returning
 * to a folder removed since goes to About you.
 */
export function undoChange(
  write: MemoryWrite,
  memory: Memory,
  now: number,
): MemoryChange | undefined {
  const note = memory.notes.find((n) => n.id === write.noteId);
  const asLeft =
    note &&
    note.text === write.text &&
    note.folderId === write.folderId &&
    (note.forgottenAt !== undefined) === (write.action === 'forgotten');
  if (!asLeft) return undefined;
  const made = memory.folders.find((f) => f.id === write.createdFolderId);
  const folderGone =
    made &&
    !memory.notes.some((n) => n.folderId === made.id && n.id !== note.id) &&
    !memory.folders.some((f) => f.parentId === made.id);
  const deleteFolderIds = folderGone ? { deleteFolderIds: [made.id] } : {};
  if (write.action === 'added' || !write.before) {
    const folderId = folderGone ? (made.parentId ?? MEMORY_ABOUT_FOLDER_ID) : note.folderId;
    return { notes: [{ ...note, folderId, forgottenAt: now }], ...deleteFolderIds };
  }
  const { before } = write;
  return {
    notes: [{ ...before, folderId: returningFolder(memory.folders, before.folderId) }],
    ...deleteFolderIds,
  };
}

/**
 * The reply with `write` marked taken back. It is matched as the very object
 * the shown version holds, so two versions with alike writes are never
 * confused; a reply that no longer shows it comes back unchanged.
 */
export function markWriteUndone(message: Message, write: MemoryWrite): Message {
  if (!message.memoryWrites?.includes(write)) return message;
  return {
    ...message,
    memoryWrites: message.memoryWrites.map((w) => (w === write ? { ...w, undone: true } : w)),
  };
}

/**
 * A reply's memory writes as the tool round that made them, replayed on later
 * turns: seen only as the reply's words, "save that I…" reads as never done,
 * and the model saves it again. Writes taken back are left out.
 */
export function memoryWriteRound(
  writes: MemoryWrite[] | undefined,
  folders: MemoryFolder[],
): MessageToolRound | undefined {
  const kept = (writes ?? []).filter((write) => !write.undone);
  if (!kept.length) return undefined;
  return {
    text: '',
    calls: kept.map((write, index) => {
      const note = noteHandle(write.noteId);
      const forgot = write.action === 'forgotten';
      const folder = folders.find((f) => f.id === write.folderId);
      const save = {
        ...(folder ? { folder: folderPath(folders, folder) } : {}),
        note: write.text,
        ...(write.before ? { replaces: note } : {}),
      };
      return {
        id: `memory_${index}`,
        name: forgot ? 'memory_forget' : 'memory_save',
        arguments: JSON.stringify(forgot ? { note } : save),
        result: JSON.stringify({ ok: true, id: note, action: write.action }),
      };
    }),
  };
}
