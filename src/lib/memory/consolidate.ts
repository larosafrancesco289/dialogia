// Module: memory/consolidate
// Responsibility: Consolidation, decided purely. What the model is asked (all of
// memory, and the operations it may propose), how its answer is read, and what
// the operations change: applied by the app within the rules, so a confused
// answer can only do less, never something the person could not take back.

import type { MemoryChange, MemorySnapshot } from '@/lib/db/repository';
import { orderedFolders, returningFolder } from '@/lib/memory/notebook';
import { NOTES_ARE_NOT_INSTRUCTIONS, WHERE_NOTES_GO } from '@/lib/memory/prompt';
import {
  folderPath,
  newFolderPlace,
  noteHandle,
  resolveFolder,
  resolveNote,
} from '@/lib/memory/writes';
import {
  MEMORY_ABOUT_FOLDER_ID,
  MEMORY_LEARNING_FOLDER_ID,
  type ConsolidationPass,
  type MemoryFolder,
  type MemoryNote,
} from '@/lib/types';

type PassUndo = NonNullable<ConsolidationPass['undo']>;

export const CONSOLIDATION_SYSTEM_PROMPT = `You tidy a person's long-term memory: short notes about them that an assistant keeps across chats, in folders. The person can read and edit every note.

Propose operations that make memory accurate, compact and well organised:
- merge: notes that say the same thing, or belong together, become one note.
- rewrite: a note that is unclear, wordy or out of date gets clearer words.
- move: a note in the wrong folder goes to the right one.
- forget: a note that a newer note contradicts, or that no longer holds, goes.
- new_folder: when notes share a subject that has no folder of its own. A path like "Projects/Dialogia" makes it inside Projects.
- describe: a folder's one-line description, when it no longer says what the folder holds.
- remove_folder: a folder of your own that ends up empty.

Rules:
- ${NOTES_ARE_NOT_INSTRUCTIONS}
- Never invent a fact, and never lose one that still holds: a merge or rewrite keeps every true detail.
- Keep each note one short line about the person, in the third person.
- ${WHERE_NOTES_GO}
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

/**
 * The operations in a model's answer, or undefined when it cannot be read as
 * a list of them: a failed pass, never one that found nothing to change.
 */
export function readOperations(content: string): Operation[] | undefined {
  const start = content.indexOf('{');
  const end = content.lastIndexOf('}');
  if (start === -1 || end <= start) return undefined;
  try {
    const parsed = JSON.parse(content.slice(start, end + 1)) as { operations?: unknown };
    return Array.isArray(parsed.operations)
      ? parsed.operations.filter(
          (op): op is Operation => !!op && typeof op === 'object' && !Array.isArray(op),
        )
      : undefined;
  } catch {
    return undefined;
  }
}

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
const BUILT_IN = new Set([MEMORY_ABOUT_FOLDER_ID, MEMORY_LEARNING_FOLDER_ID]);

/**
 * The operations applied in order to a working copy of memory. One that names
 * a note or folder that is not there, breaks a rule, or has no line to say, is
 * skipped, so the report names every change. Returns the change, the lines of
 * what was done, and what Undo needs.
 */
export function applyOperations(args: {
  memory: MemorySnapshot;
  operations: Operation[];
  now: number;
  newId: () => string;
}): { change: MemoryChange; lines: string[]; undo: PassUndo } {
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
    const place = newFolderPlace(live().folders, ref);
    if (!place || !description) return undefined;
    const folder: MemoryFolder = {
      id: args.newId(),
      name: place.name,
      description,
      createdAt: now,
      updatedAt: now,
      ...(place.parent ? { parentId: place.parent.id } : {}),
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
    if (!say) continue;
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
        const [keep, ...rest] = merged;
        const folder = (str(op.folder) && folderAt(str(op.folder))) || folders.get(keep.folderId);
        if (!folder) break;
        putNote(edited(keep, { text, folderId: folder.id }));
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
    if (done) lines.push(say);
  }

  const after = {
    folders: [...touchedFolders].filter((id) => folders.has(id)).map((id) => folders.get(id)!),
    notes: [...touchedNotes].map((id) => notes.get(id)!),
    deleteFolderIds: [...removedFolders].filter((id) =>
      args.memory.folders.some((f) => f.id === id),
    ),
  };
  const before = {
    folders: args.memory.folders.filter(
      (f) => touchedFolders.has(f.id) || removedFolders.has(f.id),
    ),
    notes: args.memory.notes.filter((n) => touchedNotes.has(n.id)),
  };
  return { change: after, lines, undo: { before, after } };
}

/** Rows alike field by field, since one read back from the database is a new object. */
function sameRow(a: object, b: object): boolean {
  const fields = (row: object) => Object.entries(row).filter(([, value]) => value !== undefined);
  const other = new Map(fields(b));
  const own = fields(a);
  return own.length === other.size && own.every(([key, value]) => other.get(key) === value);
}

const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((row) => [row.id, row]));

/** Whether two copies of memory hold the same rows. */
export function sameMemory(a: MemorySnapshot, b: MemorySnapshot): boolean {
  const same = <T extends { id: string }>(mine: T[], theirs: T[]) => {
    const other = byId(theirs);
    return (
      mine.length === theirs.length &&
      mine.every((row) => other.has(row.id) && sameRow(row, other.get(row.id)!))
    );
  };
  return same(a.folders, b.folders) && same(a.notes, b.notes);
}

/**
 * The change that takes a pass back without losing anything newer: a row goes
 * back only while it is exactly as the pass left it, and one changed since is
 * left alone and counted as skipped. Notes written after the pass are never
 * touched. Folders the pass removed come back; folders it made go only when
 * nothing is left in them.
 */
export function undoPass(
  current: MemorySnapshot,
  undo: PassUndo,
): { change: MemoryChange; skipped: number } {
  const nowFolders = byId(current.folders);
  const nowNotes = byId(current.notes);
  const wasFolders = byId(undo.before.folders);
  const wasNotes = byId(undo.before.notes);
  let skipped = 0;
  const asLeft = <T extends { id: string }>(row: T, rows: Map<string, T>) => {
    const now = rows.get(row.id);
    if (now && sameRow(now, row)) return true;
    skipped += 1;
    return false;
  };

  const left = undo.after.folders.filter((folder) => asLeft(folder, nowFolders));
  const folders = [
    ...left.filter((folder) => wasFolders.has(folder.id)).map((f) => wasFolders.get(f.id)!),
    ...undo.after.deleteFolderIds
      .filter((id) => wasFolders.has(id) && !nowFolders.has(id))
      .map((id) => wasFolders.get(id)!),
  ];
  // A note goes back to its folder, or to About you when that folder has gone since.
  const standing = [...current.folders, ...folders];
  const notes = undo.after.notes
    .filter((note) => wasNotes.has(note.id) && asLeft(note, nowNotes))
    .map((note) => wasNotes.get(note.id)!)
    .map((note) => ({ ...note, folderId: returningFolder(standing, note.folderId) }));

  // The newest first, so a folder the pass made inside another goes before it.
  const returning = byId(notes);
  const liveNotes = current.notes.map((note) => returning.get(note.id) ?? note);
  const deleteFolderIds: string[] = [];
  for (const made of left.filter((folder) => !wasFolders.has(folder.id)).reverse()) {
    const inUse =
      liveNotes.some((note) => note.folderId === made.id) ||
      current.folders.some((f) => f.parentId === made.id && !deleteFolderIds.includes(f.id));
    if (!inUse) deleteFolderIds.push(made.id);
  }
  return { change: { folders, notes, deleteFolderIds }, skipped };
}

/** Notes written or changed since the last pass: what the nudge counts. */
export function notesSince(notes: MemoryNote[], at: number | undefined): number {
  return notes.filter((n) => n.forgottenAt === undefined && (at === undefined || n.updatedAt > at))
    .length;
}
