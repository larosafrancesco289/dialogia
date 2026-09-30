import { BookOpenIcon } from '@heroicons/react/24/outline';
import { useChatStore } from '@/lib/store';
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
      {writes.map((write) => (
        <li key={`${write.action}-${write.noteId}`} className="memory-writes__line">
          <BookOpenIcon className="memory-writes__glyph" aria-hidden="true" />
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
                  onClick={() => setUI({ memoryOpen: true, memoryFolderId: write.folderId })}
                >
                  {write.text}
                </button>
              </span>
              <button
                type="button"
                className="memory-quiet"
                onClick={() => void undoMemoryWrite(message.id, write.noteId)}
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
