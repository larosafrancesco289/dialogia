// Module: memory/consolidate
// Responsibility: Consolidation, decided purely. What the model is asked (all of
// memory, and the operations it may propose), how its answer is read, and what
// the operations change: applied by the app within the rules, so a confused
// answer can only do less, never something the person could not take back.

import type { MemoryChange, MemorySnapshot } from '@/lib/db/repository';
import { orderedFolders } from '@/lib/memory/notebook';
import { folderPath, noteHandle, resolveFolder, resolveNote } from '@/lib/memory/writes';
import {
  MEMORY_ABOUT_FOLDER_ID,
  MEMORY_LEARNING_FOLDER_ID,
  type MemoryFolder,
  type MemoryNote,
} from '@/lib/types';

/**
 * A finished consolidation: when it ran, what it did in the person's words,
 * memory as it was (while it can still be undone), and when the pass before
 * it ran, which an undo returns to.
 */
export type ConsolidationPass = {
  at: number;
  lines: string[];
  before?: MemorySnapshot;
  previousAt?: number;
  /** The report is on the page until the person puts it away. */
  shown?: boolean;
};

export const CONSOLIDATION_SYSTEM_PROMPT = `You tidy a person's long-term memory: short notes about them that an assistant keeps across chats, in folders. The person can read and edit every note.

Propose operations that make memory accurate, compact and well organised:
- merge: notes that say the same thing, or belong together, become one note.
- rewrite: a note that is unclear, wordy or out of date gets clearer words.
- move: a note in the wrong folder goes to the right one.
- forget: a note that a newer note contradicts, or that no longer holds, goes.
- new_folder: when three or more notes share a topic with no folder of its own. A path like "Projects/Dialogia" makes it inside Projects.
- describe: a folder's one-line description, when it no longer says what the folder holds.
- remove_folder: a folder of your own that ends up empty.

Rules:
- Never invent a fact, and never lose one that still holds: a merge or rewrite keeps every true detail.
- Keep each note one short line about the person, in the third person.
- About you holds who they are and how they like answers; Learning holds how they learn and what they study.
- The built-in folders About you and Learning are never removed.
- Change only what is worth changing. If memory is already tidy, propose nothing.
- Give every operation a "say": one plain sentence telling the person what you did and why, as they will read it, e.g. "Merged two notes about your diet into one". When the note was written by the person, call it "your note".

Reply with JSON only, no prose around it:
{"operations": [
  {"op": "merge", "notes": ["<id>", "<id>"], "text": "...", "folder": "<path>", "say": "..."},
  {"op": "rewrite", "note": "<id>", "text": "...", "say": "..."},
  {"op": "move", "note": "<id>", "folder": "<path>", "say": "..."},
  {"op": "forget", "note": "<id>", "say": "..."},
  {"op": "new_folder", "folder": "<path>", "description": "...", "say": "..."},
  {"op": "describe", "folder": "<path>", "description": "...", "say": "..."},
  {"op": "remove_folder", "folder": "<path>", "say": "..."}
]}`;

/** All of memory as the model reads it: every folder, then every note under its folder. */
export function consolidationRequest(memory: MemorySnapshot): string {
  const lines: string[] = ['Folders:'];
  for (const { folder } of orderedFolders(memory.folders)) {
    lines.push(
      `- ${folderPath(memory.folders, folder)}: ${folder.description || '(no description)'}`,
    );
  }
  lines.push('', 'Notes:');
  for (const { folder } of orderedFolders(memory.folders)) {
    for (const note of memory.notes.filter(
      (n) => n.folderId === folder.id && n.forgottenAt === undefined,
    )) {
      const by = note.author === 'user' ? 'written by the person' : 'written by you';
      const on = new Date(note.updatedAt).toISOString().slice(0, 10);
      lines.push(
        `- [${noteHandle(note.id)}] in ${folderPath(memory.folders, folder)} (${by}, ${on}): ${note.text}`,
      );
    }
  }
  return lines.join('\n');
}

type Operation = Record<string, unknown>;

/** The operations in a model's answer; anything that is not a list of objects is none. */
export function readOperations(content: string): Operation[] {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end <= start) return [];
  try {
    const parsed = JSON.parse(content.slice(start, end + 1)) as { operations?: unknown };
    return Array.isArray(parsed.operations)
      ? parsed.operations.filter(
          (op): op is Operation => !!op && typeof op === 'object' && !Array.isArray(op),
        )
      : [];
  } catch {
    return [];
  }
}

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const BUILT_IN = new Set([MEMORY_ABOUT_FOLDER_ID, MEMORY_LEARNING_FOLDER_ID]);

/**
 * The operations applied in order to a working copy of memory. One that names
 * a note or folder that is not there, or breaks a rule, is skipped, and its
 * line is not said. Returns the change and the lines of what was done.
 */
export function applyOperations(args: {
  memory: MemorySnapshot;
  operations: Operation[];
  now: number;
  newId: () => string;
}): { change: MemoryChange; lines: string[] } {
  const { now } = args;
  const folders = new Map(args.memory.folders.map((f) => [f.id, f]));
  const notes = new Map(args.memory.notes.map((n) => [n.id, n]));
  const touchedFolders = new Set<string>();
  const touchedNotes = new Set<string>();
  const removedFolders = new Set<string>();
  const lines: string[] = [];

  const live = () => ({ folders: [...folders.values()], notes: [...notes.values()] });
  const folderAt = (ref: string) => resolveFolder(live().folders, ref);
  const noteAt = (ref: string) => resolveNote(live().notes, ref);
  const putNote = (note: MemoryNote) => {
    notes.set(note.id, note);
    touchedNotes.add(note.id);
  };
  const putFolder = (folder: MemoryFolder) => {
    folders.set(folder.id, folder);
    touchedFolders.add(folder.id);
  };
  const makeFolder = (ref: string, description: string): MemoryFolder | undefined => {
    const parts = ref
      .replace(/\s*[/›>]\s*/g, '/')
      .split('/')
      .filter(Boolean);
    const name = parts.pop();
    const parent = parts.length ? folderAt(parts.join('/')) : undefined;
    if (!name || !description || (parts.length && !parent)) return undefined;
    const folder: MemoryFolder = {
      id: args.newId(),
      name,
      description,
      createdAt: now,
      updatedAt: now,
      ...(parent ? { parentId: parent.id } : {}),
    };
    putFolder(folder);
    return folder;
  };
  const edited = (note: MemoryNote, patch: Partial<MemoryNote>): MemoryNote => ({
    ...note,
    ...patch,
    author: 'model',
    updatedAt: now,
  });

  for (const op of args.operations) {
    const say = str(op.say);
    let done = false;
    switch (op.op) {
      case 'rewrite': {
        const note = noteAt(str(op.note));
        const text = str(op.text);
        if (note && text && text !== note.text) {
          putNote(edited(note, { text }));
          done = true;
        }
        break;
      }
      case 'move': {
        const note = noteAt(str(op.note));
        const folder = folderAt(str(op.folder));
        if (note && folder && folder.id !== note.folderId) {
          putNote({ ...note, folderId: folder.id, updatedAt: now });
          done = true;
        }
        break;
      }
      case 'forget': {
        const note = noteAt(str(op.note));
        if (note) {
          putNote({ ...note, forgottenAt: now });
          done = true;
        }
        break;
      }
      case 'merge': {
        const refs = Array.isArray(op.notes) ? op.notes.map(str) : [];
        const merged = refs
          .map(noteAt)
          .filter((n, i, all): n is MemoryNote => !!n && all.indexOf(n) === i);
        const text = str(op.text);
        if (merged.length < 2 || !text) break;
        const folder = str(op.folder) ? folderAt(str(op.folder)) : undefined;
        const [keep, ...rest] = merged;
        putNote(edited(keep, { text, folderId: (folder ?? folders.get(keep.folderId))!.id }));
        for (const note of rest) putNote({ ...note, forgottenAt: now });
        done = true;
        break;
      }
      case 'new_folder': {
        const ref = str(op.folder);
        done = !!ref && !folderAt(ref) && !!makeFolder(ref, str(op.description));
        break;
      }
      case 'describe': {
        const folder = folderAt(str(op.folder));
        const description = str(op.description);
        if (folder && description && description !== folder.description) {
          putFolder({ ...folder, description, updatedAt: now });
          done = true;
        }
        break;
      }
      case 'remove_folder': {
        const folder = folderAt(str(op.folder));
        const empty =
          folder &&
          !BUILT_IN.has(folder.id) &&
          ![...notes.values()].some((n) => n.folderId === folder.id) &&
          ![...folders.values()].some((f) => f.parentId === folder.id);
        if (folder && empty) {
          folders.delete(folder.id);
          removedFolders.add(folder.id);
          done = true;
        }
        break;
      }
    }
    if (done && say) lines.push(say);
  }

  return {
    change: {
      folders: [...touchedFolders].filter((id) => folders.has(id)).map((id) => folders.get(id)!),
      notes: [...touchedNotes].map((id) => notes.get(id)!),
      deleteFolderIds: [...removedFolders].filter((id) =>
        args.memory.folders.some((f) => f.id === id),
      ),
    },
    lines,
  };
}

/** The change that puts memory back as the snapshot had it. */
export function restoreSnapshot(current: MemorySnapshot, before: MemorySnapshot): MemoryChange {
  const hadFolder = new Set(before.folders.map((f) => f.id));
  const hadNote = new Set(before.notes.map((n) => n.id));
  return {
    folders: before.folders,
    notes: before.notes,
    deleteFolderIds: current.folders.filter((f) => !hadFolder.has(f.id)).map((f) => f.id),
    deleteNoteIds: current.notes.filter((n) => !hadNote.has(n.id)).map((n) => n.id),
  };
}

/** Notes written or changed since the last pass: what the nudge counts. */
export function notesSince(notes: MemoryNote[], at: number | undefined): number {
  return notes.filter((n) => n.forgottenAt === undefined && (at === undefined || n.updatedAt > at))
    .length;
}
