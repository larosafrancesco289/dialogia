// Module: store/memorySlice
// Responsibility: Own long-term memory in the store: load it, and every change made
// to it, by the person or the model. Each change is set at once and then written,
// and the repository tells the other tabs.

import { kvGet, kvSet, repository } from '@/lib/db';
import type { MemoryChange } from '@/lib/db/repository';
import { createStoreSlice } from '@/lib/store/createSlice';
import { expiredNotes, missingBuiltInFolders } from '@/lib/memory/notebook';
import { undoChange } from '@/lib/memory/writes';
import { restoreSnapshot, type ConsolidationPass } from '@/lib/memory/consolidate';
import { NOTICE_CONSOLIDATION_FAILED } from '@/lib/store/notices';
import { v4 as uuidv4 } from 'uuid';
import type { MemoryAuthor, MemoryFolder, MemoryNote } from '@/lib/types';

export type MemorySliceState = {
  memory: {
    folders: MemoryFolder[];
    notes: MemoryNote[];
    loaded: boolean;
    /** The last consolidation; its lines and snapshot stay until dismissed or undone. */
    pass?: ConsolidationPass;
    consolidating?: boolean;
  };
};

/** Where the last consolidation is kept, so its Undo survives a reload. */
const PASS_KEY = 'memory:lastConsolidation';

const loadConsolidation = () =>
  import('@/lib/services/memoryConsolidation').then((mod) => mod.planConsolidation);

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
  /** Asks the model to tidy all of memory, and applies what it proposes. */
  consolidateMemory: () => Promise<void>;
  /** Puts memory back as it was before the last consolidation. */
  undoConsolidation: () => Promise<void>;
  /** Puts the last consolidation's report away, keeping when it ran. */
  dismissConsolidation: () => Promise<void>;
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
        const [stored, pass] = await Promise.all([
          repository.loadMemory(),
          kvGet<ConsolidationPass>(PASS_KEY).catch(() => undefined),
        ]);
        const added = missingBuiltInFolders(stored.folders, now);
        const expired = new Set(expiredNotes(stored.notes, now).map((note) => note.id));
        set(() => ({
          memory: {
            folders: [...stored.folders, ...added],
            notes: stored.notes.filter((note) => !expired.has(note.id)),
            loaded: true,
            ...(pass ? { pass } : {}),
          },
        }));
        if (added.length || expired.size) {
          await repository.writeMemory({ folders: added, deleteNoteIds: [...expired] });
        }
      },

      async refreshMemory() {
        const stored = await repository.loadMemory();
        set((s) => ({ memory: { ...s.memory, ...stored, loaded: true } }));
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

      async consolidateMemory() {
        if (get().memory.consolidating) return;
        const keepPass = async (pass: ConsolidationPass) => {
          set((s) => ({ memory: { ...s.memory, pass } }));
          await kvSet(PASS_KEY, pass);
        };
        set((s) => ({ memory: { ...s.memory, consolidating: true } }));
        try {
          const planConsolidation = await loadConsolidation();
          const { change, lines, before } = await planConsolidation(get);
          const at = Date.now();
          if (lines.length) {
            await changeMemory(change);
            await keepPass({ at, lines, before, previousAt: get().memory.pass?.at, shown: true });
          } else {
            await keepPass({ at, lines: [], shown: true });
          }
        } catch {
          get().setNotice(NOTICE_CONSOLIDATION_FAILED);
        } finally {
          set((s) => ({ memory: { ...s.memory, consolidating: false } }));
        }
      },

      async undoConsolidation() {
        const pass = get().memory.pass;
        if (!pass?.before) return;
        const { folders, notes } = get().memory;
        await changeMemory(restoreSnapshot({ folders, notes }, pass.before));
        // As if it never ran: the nudge counts from the pass before it.
        const back: ConsolidationPass | undefined =
          pass.previousAt !== undefined ? { at: pass.previousAt, lines: [] } : undefined;
        set((s) => ({ memory: { ...s.memory, pass: back } }));
        await kvSet(PASS_KEY, back);
      },

      async dismissConsolidation() {
        const pass = get().memory.pass;
        if (!pass) return;
        const kept = { at: pass.at, lines: [] };
        set((s) => ({ memory: { ...s.memory, pass: kept } }));
        await kvSet(PASS_KEY, kept);
      },
    };
  },
);
