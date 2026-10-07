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
import { useT, type Translate } from '@/lib/i18n';

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

const sameDay = (at: number) => new Date(at).toDateString() === new Date().toDateString();

/**
 * Consolidate, for the whole of memory: a quiet count of what is new since the
 * last pass beside the button, and the live mark while a pass runs.
 */
export function ConsolidateAction() {
  const t = useT();
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
        {t('memory.consolidating')}
      </span>
    );
  const empty = !notes.some((n) => n.forgottenAt === undefined);
  // Beside the report nothing more needs saying; before any pass, nothing does.
  const fresh = notesSince(notes, pass?.at);
  const nudge =
    !pass || pass.shown
      ? null
      : fresh
        ? sameDay(pass.at)
          ? t('memory.newToday', { count: fresh })
          : t('memory.newSince', { count: fresh, date: shortDate(pass.at) })
        : t('memory.upToDate');
  return (
    <>
      {nudge && <span className="memory-nudge">{nudge}</span>}
      <button
        type="button"
        className="btn-outline btn-sm memory-consolidate"
        disabled={empty}
        title={
          empty
            ? t('memory.addFirst')
            : t('memory.consolidateHint', { model: consolidationModelLabel() })
        }
        onClick={(e) => {
          // The button turns into the running line, and comes back when the pass ends.
          const page = pageOf(e.currentTarget);
          refocusIfDropped(() => page?.querySelector('.memory-running'));
          void consolidateMemory().then(() => refocusOnPage(page));
        }}
      >
        {t('memory.consolidate')}
      </button>
    </>
  );
}

/** What became of proposed changes the rules would not let the pass make. */
const skippedLine = (t: Translate, skipped: number, made: number) =>
  made ? t('memory.skippedSome', { count: skipped }) : t('memory.skippedAll', { count: skipped });

/**
 * What the last pass did, in the person's words, above every folder since it
 * may have touched any of them, with one Undo for the whole of it. Each line
 * opens the note or folder it changed, where it is now.
 */
export function ConsolidationReport({ onOpen }: { onOpen: (page: string) => void }) {
  const t = useT();
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
    <section className="memory-report motion-drop" aria-label={t('memory.reportLabel')}>
      <div className="memory-report__head">
        <span className="memory-report__title">
          {pass.lines.length
            ? t('memory.consolidatedOn', { date: shortDate(pass.at) })
            : t(skipped ? 'memory.nothingChanged' : 'memory.alreadyTidy')}
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
            {t('memory.undo')}
          </button>
        )}
        <IconButton
          size="sm"
          title={t('common.dismiss')}
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
                    title={t('memory.openInMemory')}
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
        <p className="memory-report__quiet">{skippedLine(t, skipped, pass.lines.length)}</p>
      ) : (
        !pass.lines.length && <p className="memory-report__quiet">{t('memory.nothingNeeded')}</p>
      )}
    </section>
  );
}
