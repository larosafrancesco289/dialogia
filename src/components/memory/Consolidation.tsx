import { XMarkIcon } from '@heroicons/react/24/outline';
import { shortDate } from '@/lib/ui/shortDate';
import { shallow } from 'zustand/shallow';
import { IconButton } from '@/components/ui/IconButton';
import { LogoMark } from '@/components/ui/LogoMark';
import { consolidationModelId, notesSince } from '@/lib/memory/consolidate';
import { pageOfNote } from '@/lib/memory/notebook';
import { formatModelLabel } from '@/lib/models';
import { useChatStore } from '@/lib/store';
import { refocusIfDropped } from '@/lib/ui/focus';
import type { ConsolidationLine } from '@/lib/types';

/** The Memory page holding a control, looked up on the click, before the control goes. */
const pageOf = (control: unknown) =>
  control instanceof Element ? control.closest('[role="dialog"]') : null;

/** When the report or the button pressed goes away, focus goes to Consolidate, or the open folder. */
const refocusOnPage = (page: Element | null) =>
  refocusIfDropped(
    () => page?.querySelector('.memory-consolidate'),
    () => page?.querySelector('.memory-nav__item[aria-current="page"]'),
  );

/** The model a pass runs on: the one new chats start with, read when the button is drawn. */
function consolidationModelLabel(): string {
  const s = useChatStore.getState();
  const modelId = consolidationModelId(s);
  return formatModelLabel({ model: s.modelIndex.get(modelId), fallbackId: modelId });
}

/**
 * Consolidate, for the whole of memory: a quiet count of what is new since the
 * last pass beside the button, and the live mark while a pass runs.
 */
export function ConsolidateAction() {
  const { notes, pass, consolidating } = useChatStore(
    (s) => ({
      notes: s.memory.notes,
      pass: s.memory.pass,
      consolidating: s.memory.consolidating ?? false,
    }),
    shallow,
  );
  const consolidateMemory = useChatStore((s) => s.consolidateMemory);
  if (consolidating)
    return (
      <span className="memory-running" role="status" tabIndex={-1}>
        <LogoMark live className="memory-running__mark" />
        Consolidating…
      </span>
    );
  const empty = !notes.some((n) => n.forgottenAt === undefined);
  // Beside the report nothing more needs saying; before any pass, nothing does.
  const fresh = notesSince(notes, pass?.at);
  const nudge =
    !pass || pass.shown ? null : fresh ? `${fresh} new since ${shortDate(pass.at)}` : 'Up to date';
  return (
    <>
      {nudge && <span className="memory-nudge">{nudge}</span>}
      <button
        type="button"
        className="btn-outline btn-sm memory-consolidate"
        disabled={empty}
        title={empty ? 'Add a note first' : `Tidies memory with ${consolidationModelLabel()}`}
        onClick={(e) => {
          // The button turns into the running line, and comes back when the pass ends.
          const page = pageOf(e.currentTarget);
          refocusIfDropped(() => page?.querySelector('.memory-running'));
          void consolidateMemory().then(() => refocusOnPage(page));
        }}
      >
        Consolidate
      </button>
    </>
  );
}

/** What became of proposed changes the rules would not let the pass make. */
const skippedLine = (skipped: number, made: number) =>
  made
    ? `Skipped ${skipped === 1 ? 'a proposed change' : `${skipped} proposed changes`} that could not be made.`
    : skipped === 1
      ? 'The model proposed a change, but it could not be made.'
      : `The model proposed ${skipped} changes, but none could be made.`;

/**
 * What the last pass did, in the person's words, above every folder since it
 * may have touched any of them, with one Undo for the whole of it. Each line
 * opens the note or folder it changed, where it is now.
 */
export function ConsolidationReport({ onOpen }: { onOpen: (page: string) => void }) {
  const { pass, folders, notes } = useChatStore(
    (s) => ({ pass: s.memory.pass, folders: s.memory.folders, notes: s.memory.notes }),
    shallow,
  );
  const undoConsolidation = useChatStore((s) => s.undoConsolidation);
  const dismissConsolidation = useChatStore((s) => s.dismissConsolidation);
  if (!pass?.shown) return null;
  const skipped = pass.skipped ?? 0;
  const openedPage = ({ noteId, folderId }: ConsolidationLine) =>
    noteId
      ? pageOfNote(notes, noteId)
      : folders.some((f) => f.id === folderId)
        ? folderId
        : undefined;
  return (
    <section className="memory-report motion-drop" aria-label="What consolidation changed">
      <div className="memory-report__head">
        <span className="memory-report__title">
          {pass.lines.length
            ? `Consolidated ${shortDate(pass.at)}`
            : skipped
              ? 'Nothing changed'
              : 'Already tidy'}
        </span>
        {pass.undo && (
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={(e) => {
              const page = pageOf(e.currentTarget);
              void undoConsolidation().then(() => refocusOnPage(page));
            }}
          >
            Undo
          </button>
        )}
        <IconButton
          size="sm"
          title="Dismiss"
          onClick={(e) => {
            const page = pageOf(e?.currentTarget);
            void dismissConsolidation().then(() => refocusOnPage(page));
          }}
        >
          <XMarkIcon className="h-4 w-4" />
        </IconButton>
      </div>
      {pass.lines.length > 0 && (
        <ul className="memory-report__changes">
          {pass.lines.map((line, index) => {
            const page = openedPage(line);
            return (
              <li key={index}>
                {page ? (
                  <button
                    type="button"
                    className="memory-link"
                    title="Open in Memory"
                    onClick={() => onOpen(page)}
                  >
                    {line.say}
                  </button>
                ) : (
                  line.say
                )}
              </li>
            );
          })}
        </ul>
      )}
      {skipped > 0 ? (
        <p className="memory-report__quiet">{skippedLine(skipped, pass.lines.length)}</p>
      ) : (
        !pass.lines.length && <p className="memory-report__quiet">Nothing needed changing.</p>
      )}
    </section>
  );
}
