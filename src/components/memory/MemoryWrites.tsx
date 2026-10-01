import { BookmarkIcon } from '@heroicons/react/24/outline';
import { useChatStore } from '@/lib/store';
import { FORGOTTEN_PAGE } from '@/lib/memory/notebook';
import type { Message, MemoryWrite } from '@/lib/types';

const VERB: Record<MemoryWrite['action'], string> = {
  added: 'Remembered',
  updated: 'Updated',
  forgotten: 'Forgot',
};

/**
 * What a reply wrote to memory, a quiet line for each change under its words:
 * the note opens the Memory page on its folder, and Undo takes the change back.
 */
export function MemoryWrites({ message }: { message: Message }) {
  const writes = message.memoryWrites;
  const setUI = useChatStore((s) => s.setUI);
  const undoMemoryWrite = useChatStore((s) => s.undoMemoryWrite);
  if (!writes?.length) return null;
  return (
    <ul className="memory-writes" aria-label="Changes to memory">
      {writes.map((write, index) => (
        // One reply may write one note twice, so each line is its place in the list.
        <li key={index} className="memory-writes__line">
          <BookmarkIcon className="memory-writes__glyph" aria-hidden="true" />
          {write.undone ? (
            <span className="memory-writes__undone">
              Taken back: <span className="memory-writes__text">{write.text}</span>
            </span>
          ) : (
            <>
              <span>
                {VERB[write.action]}{' '}
                <button
                  type="button"
                  className="memory-link memory-writes__text"
                  title={
                    write.action === 'updated' && write.before
                      ? `Was: ${write.before.text}`
                      : 'Open in Memory'
                  }
                  onClick={() => {
                    // Where the note is now: it may have moved, or been forgotten, since this reply.
                    const note = useChatStore
                      .getState()
                      .memory.notes.find((n) => n.id === write.noteId);
                    const page = !note
                      ? write.folderId
                      : note.forgottenAt !== undefined
                        ? FORGOTTEN_PAGE
                        : note.folderId;
                    setUI({ memoryOpen: true, memoryFolderId: page });
                  }}
                >
                  {write.text}
                </button>
              </span>
              <button
                type="button"
                className="memory-quiet"
                onClick={() => void undoMemoryWrite(message.id, index)}
              >
                Undo
              </button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
