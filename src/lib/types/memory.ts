// Long-term memory: notes in words, kept in folders, read by the model and
// by the person alike. Numbers about learning are never copied in here; the
// Learning folder shows them live from the tutor's own records.

/** Folders every memory has, under fixed ids. */
export const MEMORY_ABOUT_FOLDER_ID = 'about';
export const MEMORY_LEARNING_FOLDER_ID = 'learning';

export type MemoryFolder = {
  id: string;
  /** Absent at the top level. */
  parentId?: string;
  name: string;
  /** The folder's line in the root index: what the model reads first. */
  description: string;
  createdAt: number;
  updatedAt: number;
};

export type MemoryAuthor = 'user' | 'model';

export type MemoryNote = {
  id: string;
  folderId: string;
  text: string;
  /** Who last wrote the words. */
  author: MemoryAuthor;
  createdAt: number;
  updatedAt: number;
  /** The chat the note came from, when it came from one. */
  sourceChatId?: string;
  /** Set while the note waits in Recently forgotten. */
  forgottenAt?: number;
};

/** One tutor chat as memory's Learning folder shows it, read live from the tutor. */
export type LearningRecord = {
  chatId: string;
  goal: string;
  /** The plan's subject, shared by tutor chats that continue one another. */
  subject?: string;
  /** When the chat was last studied in. */
  studiedAt: number;
  finished: boolean;
  topics: LearningTopic[];
};

export type LearningTopic = {
  name: string;
  state: 'done' | 'current' | 'ready' | 'locked';
  /** The tutor's estimate, 0–100, once there is evidence for it. */
  percent?: number;
  /** Where the topic stands, in plain words ("Done", "Starts after Limits"). */
  status: string;
};

/**
 * A finished consolidation: when it ran, what it did in the person's words,
 * what Undo needs (while it can still be undone), and when the pass before it
 * ran, which an undo returns to.
 */
export type ConsolidationPass = {
  at: number;
  lines: string[];
  /** The rows the pass wrote, as it wrote them, and the same rows as they were before. */
  undo?: {
    before: { folders: MemoryFolder[]; notes: MemoryNote[] };
    after: { folders: MemoryFolder[]; notes: MemoryNote[]; deleteFolderIds: string[] };
  };
  previousAt?: number;
  /** The report is on the page until the person puts it away. */
  shown?: boolean;
};

/**
 * One change a reply made to memory, kept on the reply so the person sees it
 * and can take it back. `before` is the note as it was, absent for a new one.
 */
export type MemoryWrite = {
  noteId: string;
  action: 'added' | 'updated' | 'forgotten';
  /** The note's words after the change (before it, for a forgotten note). */
  text: string;
  folderId: string;
  /**
   * When it was written: the note's `updatedAt` after a save, its `forgottenAt`
   * after a forget. Undo goes ahead only while the note still says so. Absent
   * on writes kept before it was recorded.
   */
  at?: number;
  before?: MemoryNote;
  /** A folder the write created, removed again on undo if nothing else is in it. */
  createdFolderId?: string;
  undone?: boolean;
};
