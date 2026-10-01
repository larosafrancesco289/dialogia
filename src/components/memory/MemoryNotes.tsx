import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PlusIcon } from '@heroicons/react/24/outline';
import { useChatStore } from '@/lib/store';
import { shortDate } from '@/lib/ui/shortDate';
import type { MemoryFolder, MemoryNote } from '@/lib/types';

/** Opens a chat from the Memory page, which steps aside for it. */
export function useOpenChat() {
  const selectChat = useChatStore((s) => s.selectChat);
  const setUI = useChatStore((s) => s.setUI);
  return (chatId: string) => {
    selectChat(chatId);
    setUI({ memoryOpen: false, memoryFolderId: undefined, mobile: { drawerOpen: false } });
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
      {who} · {shortDate(note.updatedAt)}
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

const focusDropped = () => !document.activeElement || document.activeElement === document.body;

/**
 * When a field closes and takes focus with it, focus goes to what stands in
 * its place, so Tab carries on from there rather than from the top.
 */
function useFocusWhenClosed<T extends HTMLElement>(open: boolean) {
  const ref = useRef<T>(null);
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open && focusDropped()) ref.current?.focus();
    wasOpen.current = open;
  }, [open]);
  return ref;
}

/**
 * Takes a row away (Forget, Restore) and puts focus on the row that takes its
 * place, or on `fallback` (a selector in the page) when it was the last.
 */
export async function removeRow(button: HTMLElement, remove: Promise<void>, fallback: string) {
  const row = button.closest('li');
  const page = button.closest('[role="dialog"]');
  const next = (row?.nextElementSibling ?? row?.previousElementSibling)?.querySelector('button');
  await remove;
  const target = next?.isConnected ? next : page?.querySelector<HTMLElement>(fallback);
  if (focusDropped()) target?.focus();
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
  const textRef = useFocusWhenClosed<HTMLButtonElement>(editing);
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
        <button
          ref={textRef}
          type="button"
          className="memory-note__text"
          onClick={() => setEditing(true)}
        >
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
              aria-label={`Forget: ${note.text}`}
              onClick={(e) =>
                void removeRow(e.currentTarget, forgetMemoryNote(note.id), '.memory-add')
              }
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
  const addRef = useFocusWhenClosed<HTMLButtonElement>(open);
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
        <div className="memory-note__foot">
          <span className="memory-note__meta">Enter to save · Esc to cancel</span>
        </div>
      </div>
    );
  return (
    <button ref={addRef} type="button" className="memory-add" onClick={() => setOpen(true)}>
      <PlusIcon className="h-4 w-4" aria-hidden="true" />
      Add a note
    </button>
  );
}

/** A folder's name, then the line the model reads in its index, which the person may edit. */
export function FolderHead({ folder, level = 1 }: { folder: MemoryFolder; level?: 1 | 2 }) {
  const [editing, setEditing] = useState(false);
  const editMemoryFolder = useChatStore((s) => s.editMemoryFolder);
  const lineRef = useFocusWhenClosed<HTMLButtonElement>(editing);
  const Title = level === 1 ? 'h3' : 'h4';
  return (
    <div className={`memory-head memory-head--${level}`}>
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
        <button
          ref={lineRef}
          type="button"
          className="memory-head__line"
          onClick={() => setEditing(true)}
        >
          {folder.description || 'Say what this folder holds'}
        </button>
      )}
    </div>
  );
}
