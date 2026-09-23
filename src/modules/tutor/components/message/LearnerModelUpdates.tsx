import type { Message } from '@/lib/types';
import { ChapterBreak } from './ChapterBreak';
import { MarginNotes } from './MarginNotes';
import { useTutorAffordances } from '@/modules/tutor/ui/useTutorFlags';

const completedIn = (message: Message) =>
  message.planUpdates?.statusChanges?.find((c) => c.to === 'completed');

/**
 * What a tutor turn changed, set beneath it: every mastery change is a margin
 * note with its reason. A finished topic is a chapter break, set after the
 * reply's actions by `TopicCompleted` so it closes the exchange. The whole
 * learner model lives in the Learning Hub, not under each message.
 */
export function LearnerModelUpdates({ message }: { message: Message }) {
  const affordances = useTutorAffordances();
  const { planUpdates } = message;
  if (!planUpdates) return null;

  const completed = completedIn(message);
  // A learner's own correction arrives as a message whose body is its
  // summary; the message hides the duplicate body, so the note carries it,
  // and there is nothing for the learner to contest in their own words.
  const ownCorrection = message.metadata?.kind === 'learner_model_feedback';
  // With the learner model hidden, no mastery reaches the chat at all.
  const summary = ownCorrection && affordances.showMastery ? planUpdates.summary : undefined;
  // The chapter break states the finished topic's estimate. Where the break
  // offers no choices (a read-only plan) but the model may be corrected, the
  // finished topic keeps its note so the estimate can still be contested.
  const breakCarriesEstimate = affordances.revisePlan || !affordances.correctMastery;
  const changes =
    ownCorrection || !affordances.showMastery
      ? []
      : (planUpdates.masteryChanges ?? []).filter(
          (c) => c.from !== c.to && !(breakCarriesEstimate && c.nodeId === completed?.nodeId),
        );

  if (!changes.length && !summary) return null;

  return (
    <div className="px-4 pb-3">
      <MarginNotes message={message} changes={changes} summary={summary} />
    </div>
  );
}

/** The chapter break after a turn that finished a topic. */
export function TopicCompleted({ message }: { message: Message }) {
  const completed = completedIn(message);
  if (!completed) return null;
  const started = message.planUpdates?.statusChanges?.find(
    (c) => c.to === 'in_progress' && c.from === 'not_started',
  );
  return (
    <div className="px-4 pb-3">
      <ChapterBreak
        message={message}
        completedNodeId={completed.nodeId}
        startedNodeId={started?.nodeId}
      />
    </div>
  );
}
