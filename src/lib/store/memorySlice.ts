// Module: store/memorySlice
// Responsibility: Own long-term memory in the store: load it, and every change made
// to it, by the person or the model. Each change is set at once and then written,
// and the repository tells the other tabs, the last consolidation included.

import { MISSING_PROVIDER_KEY } from '@/lib/auth/require';
import { MemoryChangedError, repository } from '@/lib/db';
import type { MemoryChange } from '@/lib/db/repository';
import { createStoreSlice } from '@/lib/store/createSlice';
import {
  expiredNotes,
  missingBuiltInFolders,
  repairs,
  returningFolder,
} from '@/lib/memory/notebook';
import { swapWrite, undoChange } from '@/lib/memory/writes';
import { sameMemory, undoPass, UNREADABLE_PLAN } from '@/lib/memory/consolidate';
import { updateMessageById } from '@/lib/messages/updateMessageById';
import {
  NOTICE_CONSOLIDATION_FAILED,
  NOTICE_CONSOLIDATION_PARTLY_UNDONE,
  NOTICE_CONSOLIDATION_STALE,
  NOTICE_CONSOLIDATION_UNDONE,
  NOTICE_CONSOLIDATION_UNREADABLE,
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
  /**
   * Another tab changed memory or its last consolidation: read both again,
   * writing nothing. While this tab's own change is being written, the read
   * waits until it is.
   */
  refreshMemory: () => Promise<void>;
  /**
   * Sets and saves rows, removes rows, and keeps the last consolidation, as one
   * change. False when it was not saved: memory is then read again as stored,
   * and the person told unless it was refused as changed since (`expect`).
   */
  changeMemory: (change: MemoryChange) => Promise<boolean>;
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
    // This tab's writes in flight, writes ever begun, and whether a read must follow them.
    let writing = 0;
    let begun = 0;
    let readAfterWrites = false;

    const refreshMemory = async (): Promise<void> => {
      if (writing) {
        readAfterWrites = true;
        return;
      }
      const seen = begun;
      const stored = await repository.loadMemory();
      if (begun !== seen) {
        // A write of this tab's began meanwhile, so what was read may predate it.
        if (writing) readAfterWrites = true;
        else await refreshMemory();
        return;
      }
      set((s) => ({ memory: { ...s.memory, ...stored, loaded: true } }));
    };

    /** 'changed' when the change was refused because a row it expected changed since. */
    const writeChange = async (change: MemoryChange): Promise<'saved' | 'changed' | 'failed'> => {
      set((s) => ({
        memory: {
          ...s.memory,
          folders: replaceById(s.memory.folders, change.folders, change.deleteFolderIds),
          notes: replaceById(s.memory.notes, change.notes, change.deleteNoteIds),
          ...(change.pass !== undefined ? { pass: change.pass ?? undefined } : {}),
        },
      }));
      writing += 1;
      begun += 1;
      let outcome: 'saved' | 'changed' | 'failed' = 'saved';
      try {
        await repository.writeMemory(change);
      } catch (error) {
        readAfterWrites = true;
        outcome = error instanceof MemoryChangedError ? 'changed' : 'failed';
        if (outcome === 'failed') get().setNotice(NOTICE_SAVE_FAILED);
      } finally {
        writing -= 1;
      }
      if (readAfterWrites && !writing) {
        readAfterWrites = false;
        await refreshMemory();
      }
      return outcome;
    };

    const changeMemory = async (change: MemoryChange) => (await writeChange(change)) === 'saved';

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

      refreshMemory,

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
        return (await changeMemory({ notes: [note] })) ? note : undefined;
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
        const refuse = () => {
          // Forgotten already (in a branch of this chat, say, or on the Memory page).
          const note = get().memory.notes.find((n) => n.id === write.noteId);
          const gone = write.action !== 'forgotten' && (!note || note.forgottenAt !== undefined);
          get().setNotice(
            gone ? NOTICE_MEMORY_ALREADY_FORGOTTEN : NOTICE_MEMORY_CHANGED_SINCE,
            'info',
          );
        };
        const change = undoChange(write, get().memory, Date.now());
        if (!change) return refuse();
        // Marked before the write is awaited, so a second click finds it taken back.
        const taken: MemoryWrite = { ...write, undone: true };
        const mark = (from: MemoryWrite, to: MemoryWrite) =>
          set(
            (s) =>
              updateMessageById(s, message.chatId, messageId, (m) => swapWrite(m, from, to)) ?? {},
          );
        mark(write, taken);
        if (!(await changeMemory(change))) {
          // Nothing was written: the line gets its Undo back, in whichever version holds it now.
          mark(taken, write);
          // Another tab changed the note first: memory as read again says how.
          if (!undoChange(write, get().memory, Date.now())) refuse();
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
          const { change, lines, skipped, undo } = plan;
          const at = Date.now();
          const previous = get().memory.pass;
          const pass: ConsolidationPass = {
            at,
            lines,
            ...(skipped ? { skipped } : {}),
            ...(lines.length ? { undo, ...(previous ? { previousAt: previous.at } : {}) } : {}),
            shown: true,
          };
          // Another tab's write may not have reached this tab yet: the rows the
          // plan read must still be stored as it read them.
          const written = await writeChange({
            ...change,
            pass,
            expect: { folders: undo.before.folders, notes: undo.before.notes },
          });
          if (written === 'changed') get().setNotice(NOTICE_CONSOLIDATION_STALE);
        } catch (error) {
          const code = (error as { code?: unknown } | null)?.code;
          get().setNotice(
            code === MISSING_PROVIDER_KEY
              ? NOTICE_CONSOLIDATION_NO_MODEL
              : code === UNREADABLE_PLAN
                ? NOTICE_CONSOLIDATION_UNREADABLE
                : NOTICE_CONSOLIDATION_FAILED,
          );
        } finally {
          set((s) => ({ memory: { ...s.memory, consolidating: false } }));
        }
      },

      async undoConsolidation() {
        // A second try when the first is refused: another tab changed memory
        // first, and memory as read again says what is still as the pass left it.
        for (let attempt = 0; attempt < 2; attempt += 1) {
          const pass = get().memory.pass;
          if (!pass?.undo) return;
          const { change, skipped } = undoPass(get().memory, pass.undo);
          // As if it never ran: the nudge counts from the pass before it.
          const back = pass.previousAt !== undefined ? { at: pass.previousAt, lines: [] } : null;
          if (await changeMemory({ ...change, pass: back })) {
            get().setNotice(
              skipped ? NOTICE_CONSOLIDATION_PARTLY_UNDONE : NOTICE_CONSOLIDATION_UNDONE,
              'info',
            );
            return;
          }
        }
      },

      async dismissConsolidation() {
        const pass = get().memory.pass;
        if (!pass) return;
        await changeMemory({ pass: { at: pass.at, lines: [] } });
      },
    };
  },
);
