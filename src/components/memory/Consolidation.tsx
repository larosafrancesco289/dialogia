import { XMarkIcon } from '@heroicons/react/24/outline';
import { shallow } from 'zustand/shallow';
import { IconButton } from '@/components/ui/IconButton';
import { LogoMark } from '@/components/ui/LogoMark';
import { formatMemoryDate } from '@/components/memory/MemoryNotes';
import { notesSince } from '@/lib/memory/consolidate';
import { useChatStore } from '@/lib/store';

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
      <span className="memory-running" role="status">
        <LogoMark live className="memory-running__mark" />
        Consolidating…
      </span>
    );
  // Beside the report nothing more needs saying; before any pass, nothing does.
  const fresh = notesSince(notes, pass?.at);
  const nudge =
    !pass || pass.shown
      ? null
      : fresh
        ? `${fresh} new since ${formatMemoryDate(pass.at)}`
        : 'Up to date';
  return (
    <>
      {nudge && <span className="memory-nudge">{nudge}</span>}
      <button
        type="button"
        className="btn-outline btn-sm"
        disabled={!notes.some((n) => n.forgottenAt === undefined)}
        onClick={() => void consolidateMemory()}
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
          {pass.before ? `Consolidated ${formatMemoryDate(pass.at)}` : 'Already tidy'}
        </span>
        {pass.before && (
          <button
            type="button"
            className="btn-outline btn-sm"
            onClick={() => void undoConsolidation()}
          >
            Undo
          </button>
        )}
        <IconButton size="sm" title="Dismiss" onClick={() => void dismissConsolidation()}>
          <XMarkIcon className="h-4 w-4" />
        </IconButton>
      </div>
      {pass.before ? (
        <ul className="memory-report__changes">
          {pass.lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : (
        <p className="memory-report__quiet">Nothing needed changing.</p>
      )}
    </section>
  );
}
