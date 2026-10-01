// Module: store/memorySlice
// Responsibility: Own long-term memory in the store: load it, and every change made
// to it, by the person or the model. Each change is set at once and then written,
// and the repository tells the other tabs, the last consolidation included.

import { MISSING_PROVIDER_KEY } from '@/lib/auth/require';
import { repository } from '@/lib/db';
import type { MemoryChange } from '@/lib/db/repository';
import { createStoreSlice } from '@/lib/store/createSlice';
import {
  expiredNotes,
  missingBuiltInFolders,
  repairs,
  returningFolder,
} from '@/lib/memory/notebook';
import { markWriteUndone, undoChange } from '@/lib/memory/writes';
import { sameMemory, undoPass } from '@/lib/memory/consolidate';
import { updateMessageById } from '@/lib/messages/updateMessageById';
import {
  NOTICE_CONSOLIDATION_FAILED,
  NOTICE_CONSOLIDATION_PARTLY_UNDONE,
  NOTICE_CONSOLIDATION_STALE,
  NOTICE_MEMORY_ALREADY_FORGOTTEN,
  NOTICE_MEMORY_CHANGED_SINCE,
  NOTICE_CONSOLIDATION_NO_MODEL,
  NOTICE_SAVE_FAILED,
} from '@/lib/store/notices';
import { v4 as uuidv4 } from 'uuid';
import type {
  ConsolidationPass,
  MemoryAuthor,
  MemoryFolder,
  MemoryNote,
  MemoryWrite,
} from '@/lib/types';

export type MemorySliceState = {
  memory: {
    folders: MemoryFolder[];
    notes: MemoryNote[];
    loaded: boolean;
    /** The last consolidation; its lines and what Undo needs stay until dismissed or undone. */
    pass?: ConsolidationPass;
    consolidating?: boolean;
  };
};

const loadConsolidation = () =>
  import('@/lib/services/memoryConsolidation').then((mod) => mod.planConsolidation);

export type MemorySliceActions = {
  /**
   * Reads memory, adds the built-in folders it lacks, lets expired forgotten
   * notes go, and mends what could not be read (`repairs`), writing only then.
   */
  loadMemory: () => Promise<void>;
  /** Another tab changed memory or its last consolidation: read both again, writing nothing. */
  refreshMemory: () => Promise<void>;
  /** Sets and saves rows, removes rows, and keeps the last consolidation, as one change. */
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
  /**
   * Takes back the reply's write at `index`, and marks it taken back on the reply,
   * unless the note has changed since: then nothing is changed, and the person is told.
   */
  undoMemoryWrite: (messageId: string, index: number) => Promise<void>;
  /** Asks the model to tidy all of memory, and applies what it proposes. */
  consolidateMemory: () => Promise<void>;
  /** Takes the last consolidation back, apart from what has changed since. */
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
          ...(change.pass !== undefined ? { pass: change.pass ?? undefined } : {}),
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
        const { pass, ...stored } = await repository.loadMemory();
        const added = missingBuiltInFolders(stored.folders, now);
        const expired = new Set(expiredNotes(stored.notes, now).map((note) => note.id));
        const folders = [...stored.folders, ...added];
        const notes = stored.notes.filter((note) => !expired.has(note.id));
        const mended = repairs(folders, notes);
        set(() => ({
          memory: {
            folders: replaceById(folders, mended.folders),
            notes: replaceById(notes, mended.notes),
            loaded: true,
            ...(pass ? { pass } : {}),
          },
        }));
        if (added.length || expired.size || mended.folders.length || mended.notes.length) {
          await repository.writeMemory({
            folders: [...added, ...mended.folders],
            notes: mended.notes,
            deleteNoteIds: [...expired],
          });
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
        const { folders } = get().memory;
        await changeNote(id, ({ forgottenAt: _forgotten, ...note }) => ({
          ...note,
          folderId: returningFolder(folders, note.folderId),
        }));
      },

      async editMemoryFolder(id, patch) {
        const folder = get().memory.folders.find((f) => f.id === id);
        if (!folder) return;
        const name = patch.name?.trim() || folder.name;
        const description = patch.description?.trim() ?? folder.description;
        if (name === folder.name && description === folder.description) return;
        await changeMemory({ folders: [{ ...folder, name, description, updatedAt: Date.now() }] });
      },

      async undoMemoryWrite(messageId, index) {
        const message = get().messagesById[messageId];
        const write = message?.memoryWrites?.[index];
        if (!message || !write || write.undone) return;
        const change = undoChange(write, get().memory, Date.now());
        if (!change) {
          // Forgotten already (in a branch of this chat, say, or on the Memory page).
          const note = get().memory.notes.find((n) => n.id === write.noteId);
          const gone = write.action !== 'forgotten' && (!note || note.forgottenAt !== undefined);
          get().setNotice(
            gone ? NOTICE_MEMORY_ALREADY_FORGOTTEN : NOTICE_MEMORY_CHANGED_SINCE,
            'info',
          );
          return;
        }
        // Marked before the write is awaited, so a second click finds it taken back.
        let taken: MemoryWrite | undefined;
        set((s) => {
          const result = updateMessageById(s, message.chatId, messageId, (m) =>
            markWriteUndone(m, write),
          );
          taken = result?.messagesById?.[messageId]?.memoryWrites?.[index];
          return result ?? {};
        });
        try {
          await changeMemory(change);
        } catch {
          // Nothing was written: the line gets its Undo back, and memory is read again as stored.
          set(
            (s) =>
              updateMessageById(s, message.chatId, messageId, (m) => ({
                ...m,
                memoryWrites: m.memoryWrites?.map((w) => (w === taken ? write : w)),
              })) ?? {},
          );
          get().setNotice(NOTICE_SAVE_FAILED);
          await get().refreshMemory();
          return;
        }
        // The reply as it is now, which may have grown or switched versions
        // meanwhile, so no older copy of it is saved.
        const marked = get().messagesById[messageId];
        if (marked) await repository.saveMessage(marked);
      },

      async consolidateMemory() {
        if (get().memory.consolidating) return;
        set((s) => ({ memory: { ...s.memory, consolidating: true } }));
        try {
          const planConsolidation = await loadConsolidation();
          const plan = await planConsolidation(set, get);
          if (!plan) return;
          // The plan names notes as they were when it was asked for.
          if (!sameMemory(plan.before, get().memory)) {
            get().setNotice(NOTICE_CONSOLIDATION_STALE);
            return;
          }
          const { change, lines, undo } = plan;
          const at = Date.now();
          const previous = get().memory.pass;
          const pass: ConsolidationPass = lines.length
            ? { at, lines, undo, ...(previous ? { previousAt: previous.at } : {}), shown: true }
            : { at, lines, shown: true };
          await changeMemory({ ...change, pass });
        } catch (error) {
          const noModel = (error as { code?: unknown } | null)?.code === MISSING_PROVIDER_KEY;
          get().setNotice(noModel ? NOTICE_CONSOLIDATION_NO_MODEL : NOTICE_CONSOLIDATION_FAILED);
        } finally {
          set((s) => ({ memory: { ...s.memory, consolidating: false } }));
        }
      },

      async undoConsolidation() {
        const pass = get().memory.pass;
        if (!pass?.undo) return;
        const { change, skipped } = undoPass(get().memory, pass.undo);
        // As if it never ran: the nudge counts from the pass before it.
        const back = pass.previousAt !== undefined ? { at: pass.previousAt, lines: [] } : null;
        await changeMemory({ ...change, pass: back });
        if (skipped) get().setNotice(NOTICE_CONSOLIDATION_PARTLY_UNDONE, 'info');
      },

      async dismissConsolidation() {
        const pass = get().memory.pass;
        if (!pass) return;
        await changeMemory({ pass: { at: pass.at, lines: [] } });
      },
    };
  },
);
