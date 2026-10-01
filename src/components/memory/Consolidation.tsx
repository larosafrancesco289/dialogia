import { XMarkIcon } from '@heroicons/react/24/outline';
import { shortDate } from '@/lib/ui/shortDate';
import { shallow } from 'zustand/shallow';
import { IconButton } from '@/components/ui/IconButton';
import { LogoMark } from '@/components/ui/LogoMark';
import { consolidationModelId, notesSince } from '@/lib/memory/consolidate';
import { formatModelLabel } from '@/lib/models';
import { useChatStore } from '@/lib/store';
import { refocusIfDropped } from '@/lib/ui/focus';

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

/**
 * What the last pass did, in the person's words, above every folder since it
 * may have touched any of them, with one Undo for the whole of it.
 */
export function ConsolidationReport() {
  const pass = useChatStore((s) => s.memory.pass);
  const undoConsolidation = useChatStore((s) => s.undoConsolidation);
  const dismissConsolidation = useChatStore((s) => s.dismissConsolidation);
  if (!pass?.shown) return null;
  return (
    <section className="memory-report motion-drop" aria-label="What consolidation changed">
      <div className="memory-report__head">
        <span className="memory-report__title">
          {pass.lines.length ? `Consolidated ${shortDate(pass.at)}` : 'Already tidy'}
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
      {pass.lines.length ? (
        <ul className="memory-report__changes">
          {pass.lines.map((line, index) => (
            <li key={index}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="memory-report__quiet">Nothing needed changing.</p>
      )}
    </section>
  );
}
