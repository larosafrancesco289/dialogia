import { BookmarkIcon } from '@heroicons/react/24/outline';
import { useChatStore } from '@/lib/store';
import { pageOfNote } from '@/lib/memory/notebook';
import { refocusIfDropped } from '@/lib/ui/focus';
import type { Message, MemoryWrite } from '@/lib/types';
import { useT, type MessageKey } from '@/lib/i18n';

const VERB: Record<MemoryWrite['action'], MessageKey> = {
  added: 'memory.write.added',
  updated: 'memory.write.updated',
  forgotten: 'memory.write.forgotten',
};

/**
 * What a reply wrote to memory, a quiet line for each change under its words:
 * the note opens the Memory page on its folder, and Undo takes the change back.
 */
export function MemoryWrites({ message }: { message: Message }) {
  const t = useT();
  const writes = message.memoryWrites;
  const setUI = useChatStore((s) => s.setUI);
  const undoMemoryWrite = useChatStore((s) => s.undoMemoryWrite);
  if (!writes?.length) return null;
  return (
    <ul className="memory-writes" aria-label={t('memory.writesLabel')}>
      {writes.map((write, index) => (
        // One reply may write one note twice, so each line is its place in the list.
        <li key={index} className="memory-writes__line">
          <BookmarkIcon className="memory-writes__glyph" aria-hidden="true" />
          {write.undone ? (
            <span className="memory-writes__undone" tabIndex={-1}>
              {t('memory.takenBack')} <span className="memory-writes__text">{write.text}</span>
            </span>
          ) : (
            <>
              <span>
                {t(VERB[write.action])}{' '}
                <button
                  type="button"
                  className="memory-link memory-writes__text"
                  title={t('memory.openInMemory')}
                  onClick={() => {
                    const { notes } = useChatStore.getState().memory;
                    const page = pageOfNote(notes, write.noteId, write.folderId);
                    setUI({ memoryOpen: true, memoryFolderId: page });
                  }}
                >
                  {write.text}
                </button>
                {write.action === 'updated' &&
                  write.before &&
                  ` ${t('memory.was', { text: write.before.text })}`}
              </span>
              <button
                type="button"
                className="memory-quiet"
                aria-label={t('memory.undoNamed', { note: write.text })}
                onClick={(e) => {
                  // The line turns into "Taken back", or back into this one if it could not be.
                  const line = e.currentTarget.closest('li');
                  void undoMemoryWrite(message.id, index).then(() =>
                    refocusIfDropped(() =>
                      line?.querySelector('.memory-writes__undone, .memory-quiet'),
                    ),
                  );
                }}
              >
                {t('memory.undo')}
              </button>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
