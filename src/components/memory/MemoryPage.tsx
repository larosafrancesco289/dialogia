import { useEffect, useRef, useState } from 'react';
import { shallow } from 'zustand/shallow';
import { SettingsDrawerShell } from '@/components/settings/SettingsDrawerShell';
import { useChatStore } from '@/lib/store';
import { useBackToClose } from '@/lib/hooks/useBackToClose';
import { loadLearningRecords } from '@/lib/modules';
import { forgottenNotes, notesIn, orderedFolders } from '@/lib/memory/notebook';
import {
  MEMORY_ABOUT_FOLDER_ID,
  MEMORY_LEARNING_FOLDER_ID,
  type LearningRecord,
  type MemoryFolder,
  type MemoryNote,
} from '@/lib/types';
import { AddNote, FolderHead, NoteList, formatMemoryDate } from '@/components/memory/MemoryNotes';
import { LearningRecords } from '@/components/memory/LearningRecords';

const FORGOTTEN_PAGE = 'forgotten';

function FolderPage({
  folder,
  folders,
  notes,
  records,
}: {
  folder: MemoryFolder;
  folders: MemoryFolder[];
  notes: MemoryNote[];
  records: LearningRecord[];
}) {
  const own = notesIn(notes, folder.id);
  const children = orderedFolders(folders).filter(({ folder: f }) => f.parentId === folder.id);
  const isLearning = folder.id === MEMORY_LEARNING_FOLDER_ID;
  const empty = !own.length && !children.length && !(isLearning && records.length);
  return (
    <>
      <FolderHead folder={folder} />
      <NoteList notes={own} />
      {isLearning && <LearningRecords records={records} />}
      {empty && (
        <p className="memory-hint">
          {folder.id === MEMORY_ABOUT_FOLDER_ID
            ? 'What the model learns about you goes here. You can add a note yourself too.'
            : 'No notes in this folder yet.'}
        </p>
      )}
      <AddNote folderId={folder.id} />
      {children.map(({ folder: child }) => (
        <section key={child.id} className="memory-child">
          <FolderHead folder={child} level={2} />
          <NoteList notes={notesIn(notes, child.id)} />
          <AddNote folderId={child.id} />
        </section>
      ))}
    </>
  );
}

function ForgottenPage({ notes, folders }: { notes: MemoryNote[]; folders: MemoryFolder[] }) {
  const restoreMemoryNote = useChatStore((s) => s.restoreMemoryNote);
  const forgotten = forgottenNotes(notes);
  return (
    <>
      <header className="memory-head memory-head--1">
        <h3 className="memory-head__title">Recently forgotten</h3>
        <p className="memory-head__line is-static">
          Notes you or the model let go of. Each waits here for 30 days, then is gone for good.
        </p>
      </header>
      {forgotten.length ? (
        <ul className="memory-notes">
          {forgotten.map((note) => (
            <li key={note.id} className="memory-note">
              <span className="memory-forgotten__text">{note.text}</span>
              <div className="memory-note__foot">
                <span className="memory-note__meta">
                  From {folders.find((f) => f.id === note.folderId)?.name ?? 'a folder'} · forgotten{' '}
                  {formatMemoryDate(note.forgottenAt ?? note.updatedAt)}
                </span>
                <button
                  type="button"
                  className="memory-quiet memory-note__restore"
                  onClick={() => void restoreMemoryNote(note.id)}
                >
                  Restore
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="memory-hint">Nothing forgotten lately.</p>
      )}
    </>
  );
}

/**
 * Long-term memory, open to read and edit: folders down the side, one folder at
 * a time, and only the open folder scrolls.
 */
export function MemoryPage() {
  const { folders, notes } = useChatStore(
    (s) => ({ folders: s.memory.folders, notes: s.memory.notes }),
    shallow,
  );
  const setUI = useChatStore((s) => s.setUI);
  const chats = useChatStore((s) => s.chats);
  const [closing, setClosing] = useState(false);
  const [page, setPage] = useState(MEMORY_ABOUT_FOLDER_ID);
  const [records, setRecords] = useState<LearningRecord[]>([]);
  const drawerRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setClosing(true);
    window.setTimeout(() => setUI({ memoryOpen: false }), 190);
  };
  useBackToClose(!closing, close);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, []);

  // Read again whenever the chats change, so a tutor chat studied in another
  // tab, renamed or deleted shows as it is now.
  useEffect(() => {
    let live = true;
    loadLearningRecords({ get: useChatStore.getState })
      .then((next) => live && setRecords(next))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [chats]);

  const ordered = orderedFolders(folders);
  // A folder that has gone (another tab, a backup) leaves its page for the first one.
  const folder =
    page === FORGOTTEN_PAGE
      ? undefined
      : (ordered.find(({ folder: f }) => f.id === page) ?? ordered[0])?.folder;
  const count = (f: MemoryFolder) =>
    notesIn(notes, f.id).length + (f.id === MEMORY_LEARNING_FOLDER_ID ? records.length : 0);
  const forgottenCount = forgottenNotes(notes).length;

  return (
    <SettingsDrawerShell
      closing={closing}
      onClose={close}
      drawerRef={drawerRef}
      title="Memory"
      closeLabel="Close memory"
    >
      <div className="memory-body">
        <nav className="memory-nav" aria-label="Memory folders">
          {ordered.map(({ folder: f, depth }) => (
            <button
              key={f.id}
              type="button"
              className={`settings-sidebar-item memory-nav__item${depth ? ' is-child' : ''}${f.id === page ? ' is-active' : ''}`}
              aria-current={f.id === page ? 'page' : undefined}
              onClick={() => setPage(f.id)}
            >
              <span className="memory-nav__name">{f.name}</span>
              <span className="memory-nav__count">{count(f)}</span>
            </button>
          ))}
          <button
            type="button"
            className={`settings-sidebar-item memory-nav__item memory-nav__item--aside${page === FORGOTTEN_PAGE ? ' is-active' : ''}`}
            aria-current={page === FORGOTTEN_PAGE ? 'page' : undefined}
            onClick={() => setPage(FORGOTTEN_PAGE)}
          >
            <span className="memory-nav__name">Recently forgotten</span>
            <span className="memory-nav__count">{forgottenCount}</span>
          </button>
        </nav>
        {/* Only the open folder scrolls; the list of folders stays put. */}
        <div className="memory-page" key={page}>
          <div className="memory-page__inner motion-fade">
            {page === FORGOTTEN_PAGE ? (
              <ForgottenPage notes={notes} folders={folders} />
            ) : (
              folder && (
                <FolderPage folder={folder} folders={folders} notes={notes} records={records} />
              )
            )}
          </div>
        </div>
      </div>
    </SettingsDrawerShell>
  );
}
