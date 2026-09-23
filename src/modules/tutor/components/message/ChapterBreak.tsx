import { useState } from 'react';
import { useChatStore } from '@/lib/store';
import { selectMessagesForCurrentChat } from '@/lib/store/selectors';
import type { Evidence, Message } from '@/lib/types';
import { usePlanCallbacks } from '@/modules/tutor/ui/usePlanCallbacks';

const ORDINALS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
];

// Evidence the learner produced, as opposed to hints or requests.
const DEMONSTRATIONS = new Set<Evidence['type']>([
  'correct_answer',
  'incorrect_answer',
  'partial_answer',
  'insight_demonstrated',
]);

const countWord = (n: number) => (n <= ORDINALS.length ? ORDINALS[n - 1] : String(n));

// Topic names are title-like; mid-sentence, a leading article reads lower.
const inSentence = (name: string) => name.replace(/^(The|A|An) /, (a) => a.toLowerCase());

/**
 * The seam at the end of a topic. Negotiating the plan here, rather than in
 * the middle of instruction, is what keeps agency from displacing teaching:
 * the tutor states its estimate and the learner agrees, asks for more
 * practice, or goes to change the path. Only the newest seam is live; older
 * ones settle into a quiet record of the session.
 */
export function ChapterBreak({
  message,
  completedNodeId,
  startedNodeId,
}: {
  message: Message;
  completedNodeId: string;
  startedNodeId?: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  const isLatest = useChatStore((s) => {
    const messages = selectMessagesForCurrentChat(s);
    return messages[messages.length - 1]?.id === message.id;
  });
  const setUI = useChatStore((s) => s.setUI);
  const { learningPlan, onRequestMorePractice } = usePlanCallbacks();

  const index = learningPlan?.nodes.findIndex((n) => n.id === completedNodeId) ?? -1;
  const node = index >= 0 ? learningPlan!.nodes[index] : undefined;
  if (!node) return null;
  const next = startedNodeId ? learningPlan!.nodes.find((n) => n.id === startedNodeId) : undefined;

  const mastery = message.learnerModel?.mastery?.[completedNodeId];
  const percent = mastery ? Math.round(mastery.confidence * 100) : undefined;
  const answers = mastery?.evidence.filter((e) => DEMONSTRATIONS.has(e.type)).length ?? 0;
  const reopened = node.status !== 'completed';
  const live = isLatest && !dismissed && !reopened;

  const estimate =
    percent == null
      ? 'Does moving on feel right?'
      : answers > 0
        ? `I'd put you at ${percent}%, from ${countWord(answers)} answer${answers === 1 ? '' : 's'}. Does that sound right?`
        : `I'd put you at ${percent}%. Does that sound right?`;

  return (
    <section
      className={`chapter-break${live ? ' is-live' : ''}`}
      aria-label={`End of topic: ${node.name}`}
    >
      <p className="chapter-break__kicker">End of chapter {countWord(index + 1)}</p>
      <h3 className="chapter-break__title">{node.name}</h3>

      {live ? (
        <>
          <p className="chapter-break__estimate">{estimate}</p>
          <div className="chapter-break__actions">
            <button
              type="button"
              className="chapter-break__action chapter-break__action--primary"
              onClick={() => setDismissed(true)}
            >
              {next ? `Go on to ${inSentence(next.name)}` : 'Go on'}
            </button>
            <button
              type="button"
              className="chapter-break__action"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void onRequestMorePractice(completedNodeId, next?.id).finally(() => setBusy(false));
              }}
            >
              Not yet, more practice
            </button>
            <button
              type="button"
              className="chapter-break__action"
              onClick={() => setUI({ plan: { rightPanelOpen: true } })}
            >
              Change the path
            </button>
          </div>
        </>
      ) : (
        <p className="chapter-break__settled">
          {reopened
            ? 'Back for more practice'
            : percent != null
              ? `${percent}% mastery`
              : 'Completed'}
          {!reopened && next ? ` · on to ${inSentence(next.name)}` : ''}
        </p>
      )}
    </section>
  );
}
