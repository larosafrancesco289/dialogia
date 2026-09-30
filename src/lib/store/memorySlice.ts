// Module: store/memorySlice
// Responsibility: Own long-term memory in the store: load it, and every change the
// person makes to it. Each change is set at once and then written, and the
// repository tells the other tabs.

import { repository } from '@/lib/db';
import { createStoreSlice } from '@/lib/store/createSlice';
import { expiredNotes, missingBuiltInFolders } from '@/lib/memory/notebook';
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
};

export const createMemorySlice = createStoreSlice<MemorySliceState & MemorySliceActions>(
  (set, get) => {
    const putNote = async (note: MemoryNote) => {
      set((s) => ({
        memory: {
          ...s.memory,
          notes: s.memory.notes.some((n) => n.id === note.id)
            ? s.memory.notes.map((n) => (n.id === note.id ? note : n))
            : [...s.memory.notes, note],
        },
      }));
      await repository.writeMemory({ notes: [note] });
    };

    const changeNote = async (id: string, change: (note: MemoryNote) => MemoryNote) => {
      const note = get().memory.notes.find((n) => n.id === id);
      if (note) await putNote(change(note));
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
        await putNote(note);
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
        const next = { ...folder, name, description, updatedAt: Date.now() };
        set((s) => ({
          memory: {
            ...s.memory,
            folders: s.memory.folders.map((f) => (f.id === id ? next : f)),
          },
        }));
        await repository.writeMemory({ folders: [next] });
      },
    };
  },
);
