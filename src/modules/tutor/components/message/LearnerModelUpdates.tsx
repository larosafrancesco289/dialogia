import { useMemo } from 'react';
import type { Message } from '@/lib/types';
import { ChapterBreak } from './ChapterBreak';
import { MarginNotes } from './MarginNotes';
import { useTutorAffordances } from '@/modules/tutor/ui/useTutorFlags';
import { useTutorSession } from '@/modules/tutor/ui/useTutorSession';
import { effectsByMessage, type MessageEffects } from '@/modules/tutor/ui/messageViews';

type TurnChanges = {
  masteryChanges: Array<{ nodeId: string; from: number; to: number }>;
  /** Why each topic moved, when the events say; legacy turns fall back to the snapshot. */
  reasons?: Record<string, string>;
  completedNodeId?: string;
  startedNodeId?: string;
  summary?: string;
};

function fromEvents(effects: MessageEffects | undefined): TurnChanges | undefined {
  // A legacy message's imported cards leave an entry with nothing in it.
  if (!effects || (!effects.masteryChanges.length && !effects.completed)) return undefined;
  return {
    masteryChanges: effects.masteryChanges,
    reasons: Object.fromEntries(
      effects.masteryChanges.map((c) => [
        c.nodeId,
        c.notes
          .map((note) => note.trim().replace(/\.$/, ''))
          .filter(Boolean)
          .slice(-2)
          .join('; '),
      ]),
    ),
    completedNodeId: effects.completed?.nodeId,
  };
}

/** A legacy turn's changes, from the `planUpdates` it stored before the event log. */
function fromLegacy(message: Message): TurnChanges | undefined {
  const updates = message.planUpdates;
  if (!updates) return undefined;
  return {
    masteryChanges: updates.masteryChanges ?? [],
    completedNodeId: updates.statusChanges?.find((c) => c.to === 'completed')?.nodeId,
    startedNodeId: updates.statusChanges?.find(
      (c) => c.to === 'in_progress' && c.from === 'not_started',
    )?.nodeId,
    summary: updates.summary,
  };
}

function useTurnChanges(message: Message): TurnChanges | undefined {
  const { session } = useTutorSession();
  return useMemo(
    () => fromEvents(effectsByMessage(session.events).get(message.id)) ?? fromLegacy(message),
    [session.events, message],
  );
}

/**
 * What a tutor turn changed, set beneath it: every mastery change is a margin
 * note with its reason. A finished topic is a chapter break, set after the
 * reply's actions by `TopicCompleted` so it closes the exchange. The whole
 * learner model lives in the Learning Hub, not under each message.
 */
export function LearnerModelUpdates({ message }: { message: Message }) {
  const affordances = useTutorAffordances();
  const changes = useTurnChanges(message);
  if (!changes) return null;

  // A learner's own correction arrives as a message whose body is its
  // summary; the message hides the duplicate body, so the note carries it,
  // and there is nothing for the learner to contest in their own words.
  const ownCorrection = message.metadata?.kind === 'learner_model_feedback';
  // With the learner model hidden, no mastery reaches the chat at all.
  const summary = ownCorrection && affordances.showMastery ? changes.summary : undefined;
  // The chapter break states the finished topic's estimate. Where the break
  // offers no choices (a read-only plan) but the model may be corrected, the
  // finished topic keeps its note so the estimate can still be contested.
  const breakCarriesEstimate = affordances.revisePlan || !affordances.correctMastery;
  const shown =
    ownCorrection || !affordances.showMastery
      ? []
      : changes.masteryChanges.filter(
          (c) => c.from !== c.to && !(breakCarriesEstimate && c.nodeId === changes.completedNodeId),
        );

  if (!shown.length && !summary) return null;

  return (
    <div className="px-4 pb-3">
      <MarginNotes message={message} changes={shown} reasons={changes.reasons} summary={summary} />
    </div>
  );
}

/** The chapter break after a turn that finished a topic. */
export function TopicCompleted({ message }: { message: Message }) {
  const changes = useTurnChanges(message);
  if (!changes?.completedNodeId) return null;
  return (
    <div className="px-4 pb-3">
      <ChapterBreak
        message={message}
        completedNodeId={changes.completedNodeId}
        startedNodeId={changes.startedNodeId}
      />
    </div>
  );
}
