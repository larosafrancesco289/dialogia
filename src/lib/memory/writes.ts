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
  MEMORY_LEARNING_FOLDER_ID,
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

/** Words on one line: a model's note or description never breaks into the prompt's own lines. */
export const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim();

/** The longest note, and folder description, a model may write. */
export const NOTE_MAX_LENGTH = 400;
export const DESCRIPTION_MAX_LENGTH = 160;

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
  const words = (s: string) => s.replace(/[.!?\s]+$/, '');
  return notes.find(
    (note) => note.forgottenAt === undefined && same(words(note.text), words(text)),
  );
}

/** Whether a folder is Learning or sits inside it. */
function insideLearning(folders: MemoryFolder[], folder: MemoryFolder): boolean {
  let at: MemoryFolder | undefined = folder;
  for (let steps = 0; at && steps <= folders.length; steps += 1) {
    if (at.id === MEMORY_LEARNING_FOLDER_ID) return true;
    const parentId: string | undefined = at.parentId;
    at = parentId ? folders.find((f) => f.id === parentId) : undefined;
  }
  return false;
}

export function planSave(args: {
  memory: Memory;
  folder: string;
  text: string;
  replaces?: string;
  newFolderDescription?: string;
  chatId: string;
  /** Learning takes notes only in a tutor chat. */
  tutorChat?: boolean;
  now: number;
  newId: () => string;
}): WritePlan {
  const { memory, now, chatId } = args;
  const text = oneLine(args.text);
  if (!text) {
    return { ok: false, error: 'The note is empty.', hint: 'Write the fact as a short sentence.' };
  }
  if (text.length > NOTE_MAX_LENGTH) {
    return {
      ok: false,
      error: `The note is too long (over ${NOTE_MAX_LENGTH} characters).`,
      hint: 'Keep a note to one short line, and save separate facts as separate notes.',
    };
  }

  let folder = resolveFolder(memory.folders, args.folder);
  let created: MemoryFolder | undefined;
  if (!folder) {
    const place = newFolderPlace(memory.folders, args.folder);
    if (!place) {
      const parent = pathParts(args.folder).slice(0, -1).join('/');
      return {
        ok: false,
        error: parent
          ? `There is no folder "${parent}" to make "${args.folder}" in.`
          : `There is no folder "${args.folder}".`,
        hint: 'Use a folder from the memory index, or name a new top-level folder (only an existing folder can hold a new one).',
      };
    }
    const { name, parent } = place;
    const description = oneLine(args.newFolderDescription ?? '');
    if (!description) {
      return {
        ok: false,
        error: `"${name}" would be a new folder, and a new folder needs a description.`,
        hint: 'Call again with new_folder_description: one line saying what the folder holds.',
      };
    }
    if (description.length > DESCRIPTION_MAX_LENGTH) {
      return {
        ok: false,
        error: `The folder description is too long (over ${DESCRIPTION_MAX_LENGTH} characters).`,
        hint: 'Call again with a new_folder_description of one short line.',
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

  if (!args.tutorChat && insideLearning(memory.folders, folder)) {
    return {
      ok: false,
      error:
        'Learning holds only what the person studies with the tutor, and this is not a tutor chat.',
      hint: "Save it in About you, or in its subject's own folder.",
    };
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
        at: now,
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
      at: now,
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
      at: args.now,
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
  const forgot = write.action === 'forgotten';
  // Words alone miss an edit back to the same words; a write kept before `at` has only them.
  const asLeft =
    note &&
    note.text === write.text &&
    note.folderId === write.folderId &&
    (note.forgottenAt !== undefined) === forgot &&
    (write.at === undefined || (forgot ? note.forgottenAt : note.updatedAt) === write.at);
  if (!asLeft) return undefined;
  // Checked again as it is written, so a change another tab made meanwhile is never overwritten.
  const expect = { notes: [note] };
  const made = memory.folders.find((f) => f.id === write.createdFolderId);
  const folderGone =
    made &&
    !memory.notes.some((n) => n.folderId === made.id && n.id !== note.id) &&
    !memory.folders.some((f) => f.parentId === made.id);
  const deleteFolderIds = folderGone ? { deleteFolderIds: [made.id] } : {};
  if (write.action === 'added' || !write.before) {
    const folderId = folderGone ? (made.parentId ?? MEMORY_ABOUT_FOLDER_ID) : note.folderId;
    return { notes: [{ ...note, folderId, forgottenAt: now }], ...deleteFolderIds, expect };
  }
  const { before } = write;
  return {
    notes: [{ ...before, folderId: returningFolder(memory.folders, before.folderId) }],
    ...deleteFolderIds,
    expect,
  };
}

/**
 * The reply with the write `from` replaced by `to`, in whichever version holds
 * it now. It is matched as the very object, so two versions with alike writes
 * are never confused; a reply that holds it nowhere comes back unchanged.
 */
export function swapWrite(message: Message, from: MemoryWrite, to: MemoryWrite): Message {
  const swap = (writes: MemoryWrite[] | undefined) =>
    writes?.includes(from) ? writes.map((w) => (w === from ? to : w)) : writes;
  if (message.memoryWrites?.includes(from)) {
    return { ...message, memoryWrites: swap(message.memoryWrites) };
  }
  const at = message.versions?.findIndex((v) => v.memoryWrites?.includes(from)) ?? -1;
  if (at === -1) return message;
  const versions = message.versions!.map((v, i) =>
    i === at ? { ...v, memoryWrites: swap(v.memoryWrites) } : v,
  );
  return { ...message, versions };
}

/** What became of a written note since: the person may have edited, forgotten or restored it. */
function sinceWrite(write: MemoryWrite, notes: MemoryNote[]): string | undefined {
  const note = notes.find((n) => n.id === write.noteId);
  const live = !!note && note.forgottenAt === undefined;
  if (write.action === 'forgotten') return live ? 'restored since' : undefined;
  if (!live) return 'forgotten since';
  return note.text === write.text ? undefined : `now reads: ${note.text}`;
}

/**
 * A reply's memory writes as the tool round that made them, replayed on later
 * turns: seen only as the reply's words, "save that I…" reads as never done,
 * and the model saves it again. Writes taken back are left out; a note changed
 * since says so, so the model neither trusts the old words nor saves them again.
 */
export function memoryWriteRound(
  writes: MemoryWrite[] | undefined,
  memory: Memory,
): MessageToolRound | undefined {
  const kept = (writes ?? []).filter((write) => !write.undone);
  if (!kept.length) return undefined;
  const { folders, notes } = memory;
  return {
    text: '',
    calls: kept.map((write, index) => {
      const note = noteHandle(write.noteId);
      const forgot = write.action === 'forgotten';
      const since = sinceWrite(write, notes);
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
        result: JSON.stringify({
          ok: true,
          id: note,
          action: write.action,
          ...(since ? { since } : {}),
        }),
      };
    }),
  };
}
