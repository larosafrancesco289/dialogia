import { useState } from 'react';
import { useChatStore } from '@/lib/store';
import { selectMessagesForCurrentChat } from '@/lib/store/selectors';
import type { Message } from '@/lib/types';
import { nextReadyNode, percent as toPercent } from '@/modules/tutor/engine';
import { seamOpen, type Completion } from '@/modules/tutor/ui/messageViews';
import { usePlanCallbacks } from '@/modules/tutor/ui/usePlanCallbacks';
import { useTutorAffordances } from '@/modules/tutor/ui/useTutorFlags';
import { seamChoices } from '@/modules/tutor/ui/tutorFlags';
import { Markdown } from '@/components/Markdown';
import { formatPercent } from '@/lib/i18n/format';
import { useT } from '@/modules/tutor/i18n';

/**
 * The seam at the end of a topic. Negotiating the plan here, rather than in
 * the middle of instruction, is what keeps agency from displacing teaching:
 * the tutor states its estimate and the learner goes on, asks for more
 * practice, or goes to edit the plan. Only the newest seam is live; older
 * ones settle into a quiet record of the session. The estimate is the one the
 * learner is deciding on (a correction while the break is open shows at once)
 * and, once settled, the one they went on with; what came next is what they
 * chose at this seam. Both come from the log: a topic finished again later has
 * its own.
 */
export function ChapterBreak({
  message,
  completion,
}: {
  message: Message;
  completion: Completion;
}) {
  const t = useT();
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
  const reopened = !!completion.reopened;
  // The seam is open until the learner (or the tutor) starts what comes next.
  const atSeam = isLatest && seamOpen(completion, state.phase);
  // Going on follows the plan, so it is always offered; the other two change
  // it, so a read-only plan leaves them out.
  const { goOn: canGoOn, negotiate: canNegotiate } = seamChoices(affordances, {
    phase: state.phase,
    hasNext: !!next,
  });
  const live = atSeam && (canGoOn || canNegotiate);

  // The interface speaks here, not the tutor: the number, plainly; the question is the plan's.
  const shown = percent == null ? null : formatPercent(percent / 100);
  const estimate = shown == null ? null : t('chapter.estimate', { percent: shown });
  const question = t(canGoOn ? 'chapter.ready' : 'chapter.last');

  const run = (fn: () => Promise<void>) => {
    setBusy(true);
    void fn().finally(() => setBusy(false));
  };

  return (
    <section
      className={`chapter-break${live ? ' is-live' : ''}`}
      aria-label={t('chapter.label', { name: node.name })}
    >
      <p className="chapter-break__kicker">
        {t('chapter.kicker', { at: index + 1, count: learningPlan!.nodes.length })}
      </p>
      <h3 className="chapter-break__title">
        <Markdown inline content={node.name} />
      </h3>

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
                {t.rich('chapter.goOn', { topic: <Markdown inline content={next.name} /> })}
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
                  {t('chapter.morePractice')}
                </button>
                <button
                  type="button"
                  className="chapter-break__action"
                  onClick={() => setUI({ plan: { rightPanelOpen: true, revising: true } })}
                >
                  {t('hub.editPlan')}
                </button>
              </>
            )}
          </div>
        </>
      ) : (
        <p className="chapter-break__settled">
          {reopened
            ? t('chapter.back')
            : shown != null
              ? t('chapter.finishedAt', { percent: shown })
              : t('chapter.finished')}
          {!reopened && started && (
            <>
              {' · '}
              {t.rich('chapter.next', { topic: <Markdown inline content={started.name} /> })}
            </>
          )}
        </p>
      )}
    </section>
  );
}
