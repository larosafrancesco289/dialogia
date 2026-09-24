import { useMemo } from 'react';
import type { Message } from '@/lib/types';
import { ChapterBreak } from './ChapterBreak';
import { MarginNotes } from './MarginNotes';
import { useTutorAffordances } from '@/modules/tutor/ui/useTutorFlags';
import { useTutorSession } from '@/modules/tutor/ui/useTutorSession';
import { effectsByMessage, type MessageEffects } from '@/modules/tutor/ui/messageViews';

function useMessageEffects(messageId: string): MessageEffects | undefined {
  const { session } = useTutorSession();
  return useMemo(
    () => effectsByMessage(session.events).get(messageId),
    [session.events, messageId],
  );
}

/**
 * What a message's events changed, set beneath it: every mastery change is a
 * margin note with its reason. A finished topic is a chapter break, set after
 * the reply's actions by `TopicCompleted` so it closes the exchange. The whole
 * learner model lives in the Learning Hub, not under each message.
 */
export function LearnerModelUpdates({ message }: { message: Message }) {
  const affordances = useTutorAffordances();
  const effects = useMessageEffects(message.id);
  // With the learner model hidden, no mastery reaches the chat at all.
  if (!effects || !affordances.showMastery) return null;

  // The chapter break states the finished topic's estimate. Where the break
  // offers no plan choices but the model may be corrected, the finished topic
  // keeps its note so the estimate can still be contested.
  const breakCarriesEstimate = affordances.revisePlan || !affordances.correctMastery;
  const completedId = effects.completed?.nodeId;
  const shown = effects.masteryChanges.filter(
    (c) => c.from !== c.to && !(breakCarriesEstimate && c.nodeId === completedId),
  );
  if (!shown.length) return null;

  return (
    <div className="px-4 pb-3">
      <MarginNotes changes={shown} />
    </div>
  );
}

/** The chapter break after the message whose events finished a topic. */
export function TopicCompleted({ message }: { message: Message }) {
  const completed = useMessageEffects(message.id)?.completed;
  if (!completed) return null;
  return (
    <div className="px-4 pb-3">
      <ChapterBreak message={message} completion={completed} />
    </div>
  );
}
