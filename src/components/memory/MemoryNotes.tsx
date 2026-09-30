import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import { useChatStore } from '@/lib/store';
import type { MemoryFolder, MemoryNote } from '@/lib/types';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "30 Sep", or "30 Sep 2025" outside this year. */
export function formatMemoryDate(at: number): string {
  const date = new Date(at);
  const day = `${date.getDate()} ${MONTHS[date.getMonth()]}`;
  return date.getFullYear() === new Date().getFullYear() ? day : `${day} ${date.getFullYear()}`;
}

/** Opens a chat from the Memory page, which steps aside for it. */
export function useOpenChat() {
  const selectChat = useChatStore((s) => s.selectChat);
  const setUI = useChatStore((s) => s.setUI);
  return (chatId: string) => {
    selectChat(chatId);
    setUI({ memoryOpen: false, mobile: { drawerOpen: false } });
  };
}

function Provenance({ note }: { note: MemoryNote }) {
  const source = useChatStore((s) =>
    note.sourceChatId ? s.chats.find((chat) => chat.id === note.sourceChatId) : undefined,
  );
  const openChat = useOpenChat();
  const who =
    note.author === 'model'
      ? 'Written by the model'
      : note.updatedAt > note.createdAt
        ? 'Edited by you'
        : 'Written by you';
  return (
    <span className="memory-note__meta">
      {who} · {formatMemoryDate(note.updatedAt)}
      {source && (
        <>
          {' · from '}
          <button type="button" className="memory-link" onClick={() => openChat(source.id)}>
            {source.title || 'Untitled chat'}
          </button>
        </>
      )}
    </span>
  );
}

/**
 * A plain field in the note's own type: Enter saves, Shift+Enter breaks the
 * line, Escape and an emptied field leave the words as they were.
 */
function TextField({
  text,
  onSave,
  onCancel,
  className,
  label,
  placeholder,
}: {
  text: string;
  onSave: (text: string) => void;
  onCancel: () => void;
  className: string;
  label: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(text);
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);
  useEffect(() => {
    const el = ref.current;
    el?.focus();
    el?.setSelectionRange(el.value.length, el.value.length);
  }, []);
  return (
    <textarea
      ref={ref}
      className={className}
      aria-label={label}
      value={draft}
      placeholder={placeholder}
      rows={1}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => (draft.trim() ? onSave(draft) : onCancel())}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          // Handled here, so the page does not close too.
          e.preventDefault();
          onCancel();
        }
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function NoteRow({ note }: { note: MemoryNote }) {
  const [editing, setEditing] = useState(false);
  const editMemoryNote = useChatStore((s) => s.editMemoryNote);
  const forgetMemoryNote = useChatStore((s) => s.forgetMemoryNote);
  return (
    <li className={`memory-note${editing ? ' is-editing' : ''}`}>
      {editing ? (
        <TextField
          className="memory-note__field"
          label="Note"
          text={note.text}
          onSave={(text) => {
            void editMemoryNote(note.id, text);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <button type="button" className="memory-note__text" onClick={() => setEditing(true)}>
          {note.text}
        </button>
      )}
      <div className="memory-note__foot">
        {editing ? (
          <span className="memory-note__meta">Enter to save · Esc to cancel</span>
        ) : (
          <>
            <Provenance note={note} />
            <button
              type="button"
              className="memory-quiet memory-note__forget"
              onClick={() => void forgetMemoryNote(note.id)}
            >
              Forget
            </button>
          </>
        )}
      </div>
    </li>
  );
}

export function NoteList({ notes }: { notes: MemoryNote[] }) {
  if (!notes.length) return null;
  return (
    <ul className="memory-notes">
      {notes.map((note) => (
        <NoteRow key={note.id} note={note} />
      ))}
    </ul>
  );
}

export function AddNote({ folderId }: { folderId: string }) {
  const [open, setOpen] = useState(false);
  const addMemoryNote = useChatStore((s) => s.addMemoryNote);
  if (open)
    return (
      <div className="memory-note is-editing memory-add__field">
        <TextField
          className="memory-note__field"
          label="New note"
          text=""
          placeholder="Something the model should know"
          onSave={(text) => {
            void addMemoryNote(folderId, text);
            setOpen(false);
          }}
          onCancel={() => setOpen(false)}
        />
      </div>
    );
  return (
    <button type="button" className="memory-add" onClick={() => setOpen(true)}>
      <PlusIcon className="h-4 w-4" aria-hidden="true" />
      Add a note
    </button>
  );
}

/** A folder's name, then the line the model reads in its index, which the person may edit. */
export function FolderHead({ folder, level = 1 }: { folder: MemoryFolder; level?: 1 | 2 }) {
  const [editing, setEditing] = useState(false);
  const editMemoryFolder = useChatStore((s) => s.editMemoryFolder);
  const Title = level === 1 ? 'h3' : 'h4';
  return (
    <header className={`memory-head memory-head--${level}`}>
      <Title className="memory-head__title">{folder.name}</Title>
      {editing ? (
        <>
          <TextField
            className="memory-head__field"
            label={`What ${folder.name} holds`}
            text={folder.description}
            onSave={(description) => {
              void editMemoryFolder(folder.id, { description });
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
          <span className="memory-note__meta">
            The model reads this line first, and opens the folder when it fits.
          </span>
        </>
      ) : (
        <button type="button" className="memory-head__line" onClick={() => setEditing(true)}>
          {folder.description || 'Say what this folder holds'}
        </button>
      )}
    </header>
  );
}
