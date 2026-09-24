import { useState } from 'react';
import { useChatStore } from '@/lib/store';
import { selectMessagesForCurrentChat } from '@/lib/store/selectors';
import type { Message } from '@/lib/types';
import { nextReadyNode, percent as toPercent } from '@/modules/tutor/engine';
import { evidenceBehind, type Completion } from '@/modules/tutor/ui/messageViews';
import { usePlanCallbacks } from '@/modules/tutor/ui/usePlanCallbacks';
import { countWord, inSentence } from '@/modules/tutor/lib/text';
import { useTutorAffordances } from '@/modules/tutor/ui/useTutorFlags';
import { seamChoices } from '@/modules/tutor/ui/tutorFlags';

/**
 * The seam at the end of a topic. Negotiating the plan here, rather than in
 * the middle of instruction, is what keeps agency from displacing teaching:
 * the tutor states its estimate and the learner goes on, asks for more
 * practice, or goes to change the path. Only the newest seam is live; older
 * ones settle into a quiet record of the session. The estimate is the one the
 * topic had when it finished, from the log, not today's.
 */
export function ChapterBreak({
  message,
  completion,
}: {
  message: Message;
  completion: Completion;
}) {
  const [busy, setBusy] = useState(false);
  const isLatest = useChatStore((s) => {
    const messages = selectMessagesForCurrentChat(s);
    return messages[messages.length - 1]?.id === message.id;
  });
  const setUI = useChatStore((s) => s.setUI);
  const { state, learningPlan, onRequestMorePractice, onGoOn } = usePlanCallbacks();
  const affordances = useTutorAffordances();

  const index = learningPlan?.nodes.findIndex((n) => n.id === completion.nodeId) ?? -1;
  const node = index >= 0 ? learningPlan!.nodes[index] : undefined;
  if (!node) return null;

  const started = completion.nextNodeId
    ? learningPlan!.nodes.find((n) => n.id === completion.nextNodeId)
    : undefined;
  const next = started ?? nextReadyNode(learningPlan);
  const mastery = completion.mastery;
  const percent = affordances.showMastery && mastery ? toPercent(mastery.confidence) : undefined;
  const behind = mastery ? evidenceBehind(mastery.evidence) : undefined;
  const reopened = node.status !== 'completed';
  // The seam is open until the learner (or the tutor) starts what comes next.
  const atSeam =
    isLatest &&
    !reopened &&
    !started &&
    (state.phase === 'interlude' || state.phase === 'complete');
  // Going on follows the plan, so it is always offered; the other two change
  // it, so a read-only plan leaves them out.
  const { goOn: canGoOn, negotiate: canNegotiate } = seamChoices(affordances, {
    phase: state.phase,
    hasNext: !!next,
  });
  const live = atSeam && (canGoOn || canNegotiate);

  // The interface speaks here, not the tutor, so it reports the tutor's
  // estimate rather than voicing it; the question is the plan's.
  const estimate =
    percent == null
      ? null
      : behind
        ? `The tutor puts you at ${percent}%, from ${behind}.`
        : `The tutor puts you at ${percent}%.`;
  const question = canGoOn ? 'Ready to move on?' : 'That was the last topic in the plan.';

  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    void fn().finally(() => setBusy(false));
  };

  return (
    <section
      className={`chapter-break${live ? ' is-live' : ''}`}
      aria-label={`End of topic: ${node.name}`}
    >
      <p className="chapter-break__kicker">End of chapter {countWord(index + 1)}</p>
      <h3 className="chapter-break__title">{node.name}</h3>

      {live ? (
        <>
          <p className="chapter-break__estimate">
            {estimate ? `${estimate} ${question}` : question}
          </p>
          <div className="chapter-break__actions">
            {canGoOn && next && (
              <button
                type="button"
                className="chapter-break__action chapter-break__action--primary"
                disabled={busy}
                onClick={() => run(() => onGoOn(next.id))}
              >
                Go on to {inSentence(next.name)}
              </button>
            )}
            {canNegotiate && (
              <>
                <button
                  type="button"
                  className="chapter-break__action"
                  disabled={busy}
                  onClick={() => run(() => onRequestMorePractice(completion.nodeId))}
                >
                  Not yet, more practice
                </button>
                <button
                  type="button"
                  className="chapter-break__action"
                  onClick={() => setUI({ plan: { rightPanelOpen: true, revising: true } })}
                >
                  Change the path
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        <p className="chapter-break__settled">
          {reopened
            ? 'Back for more practice'
            : percent != null
              ? `${percent}% mastery`
              : 'Completed'}
          {!reopened && started ? ` · on to ${inSentence(started.name)}` : ''}
        </p>
      )}
    </section>
  );
}
