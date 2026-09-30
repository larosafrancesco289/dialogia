// Module: store/memorySlice
// Responsibility: Own long-term memory in the store: load it, and every change made
// to it, by the person or the model. Each change is set at once and then written,
// and the repository tells the other tabs.

import { repository } from '@/lib/db';
import type { MemoryChange } from '@/lib/db/repository';
import { createStoreSlice } from '@/lib/store/createSlice';
import { expiredNotes, missingBuiltInFolders } from '@/lib/memory/notebook';
import { undoChange } from '@/lib/memory/writes';
import { v4 as uuidv4 } from 'uuid';
import type { MemoryAuthor, MemoryFolder, MemoryNote } from '@/lib/types';

export type MemorySliceState = {
  memory: { folders: MemoryFolder[]; notes: MemoryNote[]; loaded: boolean };
};

export type MemorySliceActions = {
  /** Reads memory, adds the built-in folders it lacks, and lets expired forgotten notes go. */
  loadMemory: () => Promise<void>;
  /** Another tab changed memory: read it again, writing nothing. */
  refreshMemory: () => Promise<void>;
  /** Sets and saves rows, and removes rows, as one change. */
  changeMemory: (change: MemoryChange) => Promise<void>;
  addMemoryNote: (
    folderId: string,
    text: string,
    options?: { author?: MemoryAuthor; sourceChatId?: string },
  ) => Promise<MemoryNote | undefined>;
  editMemoryNote: (id: string, text: string) => Promise<void>;
  forgetMemoryNote: (id: string) => Promise<void>;
  restoreMemoryNote: (id: string) => Promise<void>;
  editMemoryFolder: (
    id: string,
    patch: Partial<Pick<MemoryFolder, 'name' | 'description'>>,
  ) => Promise<void>;
  /** Takes back what a reply wrote to a note, and marks it taken back on the reply. */
  undoMemoryWrite: (messageId: string, noteId: string) => Promise<void>;
};

const replaceById = <T extends { id: string }>(list: T[], rows: T[] = [], drop: string[] = []) => {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const gone = new Set(drop);
  const kept = list.filter((row) => !gone.has(row.id)).map((row) => byId.get(row.id) ?? row);
  const have = new Set(list.map((row) => row.id));
  return [...kept, ...rows.filter((row) => !have.has(row.id) && !gone.has(row.id))];
};

export const createMemorySlice = createStoreSlice<MemorySliceState & MemorySliceActions>(
  (set, get) => {
    const changeMemory = async (change: MemoryChange) => {
      set((s) => ({
        memory: {
          ...s.memory,
          folders: replaceById(s.memory.folders, change.folders, change.deleteFolderIds),
          notes: replaceById(s.memory.notes, change.notes, change.deleteNoteIds),
        },
      }));
      await repository.writeMemory(change);
    };

    const changeNote = async (id: string, change: (note: MemoryNote) => MemoryNote) => {
      const note = get().memory.notes.find((n) => n.id === id);
      if (!note) return;
      const next = change(note);
      if (next !== note) await changeMemory({ notes: [next] });
    };

    return {
      memory: { folders: [], notes: [], loaded: false },

      async loadMemory() {
        const now = Date.now();
        const stored = await repository.loadMemory();
        const added = missingBuiltInFolders(stored.folders, now);
        const expired = new Set(expiredNotes(stored.notes, now).map((note) => note.id));
        set(() => ({
          memory: {
            folders: [...stored.folders, ...added],
            notes: stored.notes.filter((note) => !expired.has(note.id)),
            loaded: true,
          },
        }));
        if (added.length || expired.size) {
          await repository.writeMemory({ folders: added, deleteNoteIds: [...expired] });
        }
      },

      async refreshMemory() {
        const stored = await repository.loadMemory();
        set(() => ({ memory: { ...stored, loaded: true } }));
      },

      changeMemory,

      async addMemoryNote(folderId, text, options) {
        const words = text.trim();
        if (!words) return undefined;
        const now = Date.now();
        const note: MemoryNote = {
          id: uuidv4(),
          folderId,
          text: words,
          author: options?.author ?? 'user',
          createdAt: now,
          updatedAt: now,
          ...(options?.sourceChatId ? { sourceChatId: options.sourceChatId } : {}),
        };
        await changeMemory({ notes: [note] });
        return note;
      },

      async editMemoryNote(id, text) {
        const words = text.trim();
        if (!words) return;
        await changeNote(id, (note) =>
          note.text === words
            ? note
            : { ...note, text: words, author: 'user', updatedAt: Date.now() },
        );
      },

      async forgetMemoryNote(id) {
        await changeNote(id, (note) => ({ ...note, forgottenAt: Date.now() }));
      },

      async restoreMemoryNote(id) {
        await changeNote(id, ({ forgottenAt: _forgotten, ...note }) => note);
      },

      async editMemoryFolder(id, patch) {
        const folder = get().memory.folders.find((f) => f.id === id);
        if (!folder) return;
        const name = patch.name?.trim() || folder.name;
        const description = patch.description?.trim() ?? folder.description;
        if (name === folder.name && description === folder.description) return;
        await changeMemory({ folders: [{ ...folder, name, description, updatedAt: Date.now() }] });
      },

      async undoMemoryWrite(messageId, noteId) {
        const message = get().messagesById[messageId];
        const write = message?.memoryWrites?.find((w) => w.noteId === noteId && !w.undone);
        if (!message || !write) return;
        await changeMemory(undoChange(write, get().memory));
        const next = {
          ...message,
          memoryWrites: message.memoryWrites!.map((w) =>
            w === write ? { ...w, undone: true } : w,
          ),
        };
        set((s) => ({ messagesById: { ...s.messagesById, [messageId]: next } }));
        await repository.saveMessage(next);
      },
    };
  },
);
