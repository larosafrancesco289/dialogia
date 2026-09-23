import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckIcon,
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import type { TutorMCQItem } from '@/lib/types';
import { useChatStore } from '@/lib/store';
import { contentVariants } from '@/modules/tutor/components/message/shared';
import { StepperDots } from '@/modules/tutor/components/message/StepperDots';
import { useStepper } from '@/modules/tutor/components/message/hooks/useStepper';
import { InlineEmphasis } from '@/modules/tutor/components/message/InlineEmphasis';

export function McqCard({ items, messageId }: { items: TutorMCQItem[]; messageId: string }) {
  const log = useChatStore((s) => s.logTutorResult);
  const setTutorAttemptMcq = useChatStore((s) => s.setTutorAttemptMcq);
  const patchTutorEntry = useChatStore((s) => s.patchTutorEntry);
  const sendUserMessage = useChatStore((s) => s.sendUserMessage);
  const tutorEntry = useChatStore((s) => s.ui.tutor?.byMessageId?.[messageId]);
  const attempts = tutorEntry?.attempts;
  const mcq = useMemo(
    () =>
      (attempts?.mcq as Record<string, { choice?: number; done?: boolean; correct?: boolean }>) ||
      {},
    [attempts],
  );
  const isPending = useCallback((item: TutorMCQItem) => !mcq[item.id]?.done, [mcq]);
  const { total, activeIndex, goToIndex, goPrevious, goNext, activeItem } = useStepper(
    items,
    isPending,
  );
  const advanceTimer = useRef<number | null>(null);
  const completionStarted = useRef(false);

  useEffect(
    () => () => {
      if (advanceTimer.current != null) {
        window.clearTimeout(advanceTimer.current);
        advanceTimer.current = null;
      }
    },
    [],
  );

  const answeredCount = useMemo(
    () => items.filter((item) => mcq[item.id]?.done).length,
    [items, mcq],
  );
  const correctCount = useMemo(
    () => items.filter((item) => mcq[item.id]?.done && mcq[item.id]?.correct).length,
    [items, mcq],
  );

  useEffect(() => {
    if (total === 0 || answeredCount !== total) return;
    if (completionStarted.current) return;
    if (tutorEntry?.diagnostic) return;
    if (typeof tutorEntry?.quizMeta?.completedAt === 'number') return;
    completionStarted.current = true;

    const now = Date.now();
    const prevQuizMeta = tutorEntry?.quizMeta || {};
    void patchTutorEntry(messageId, {
      quizMeta: {
        ...prevQuizMeta,
        completedAt: now,
        type: 'mcq',
      },
    })
      .then(() =>
        sendUserMessage(`Completed quiz (${correctCount}/${total} correct).`, {
          metadata: {
            hiddenFromUser: true,
            kind: 'tutor_quiz_completion',
          },
        }),
      )
      .catch(() => {
        completionStarted.current = false;
      });
  }, [answeredCount, correctCount, messageId, patchTutorEntry, sendUserMessage, total, tutorEntry]);

  const activeAttempt = activeItem ? mcq[activeItem.id] || {} : {};
  const picked = activeAttempt.choice;
  const answered = !!activeAttempt.done;
  const correctIdx = typeof activeItem?.correct === 'number' ? activeItem.correct : -1;

  const handleSelect = (choiceIdx: number) => {
    if (!activeItem) return;
    if (answered) return;
    const correct = choiceIdx === correctIdx;
    log({
      kind: 'mcq',
      itemId: activeItem.id,
      correct,
      topic: activeItem.topic,
      skill: activeItem.skill,
      difficulty: activeItem.difficulty,
    });
    setTutorAttemptMcq(messageId, activeItem.id, choiceIdx, correct);

    if (advanceTimer.current != null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    if (correct && activeIndex < total - 1) {
      advanceTimer.current = window.setTimeout(() => {
        goToIndex(activeIndex + 1);
        advanceTimer.current = null;
      }, 1200);
    }
  };

  if (!total || !activeItem) return null;

  return (
    <div className="exercise">
      <div className="exercise__bar">
        <span className="exercise__kicker">
          Question {activeIndex + 1} of {total}
        </span>
        <StepperDots
          items={items}
          activeIndex={activeIndex}
          resolveStatus={(item) => {
            const attempt = mcq[item.id];
            if (!attempt?.done) return 'pending';
            return attempt.correct ? 'correct' : 'incorrect';
          }}
          onSelect={goToIndex}
        />
      </div>

      <div className="relative min-h-[200px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeItem.id}
            variants={contentVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="flex flex-col gap-4"
          >
            <p className="exercise__question">
              <InlineEmphasis text={activeItem.question} />
            </p>
            <div className="exercise__choices">
              {activeItem.choices.map((choice, idx) => {
                const isPicked = picked === idx;
                const isCorrect = correctIdx === idx;
                let state = '';
                if (answered) {
                  if (isCorrect) state = 'is-correct';
                  else if (isPicked) state = 'is-wrong';
                  else state = 'is-muted';
                } else if (isPicked) {
                  state = 'is-picked';
                }

                return (
                  <button
                    type="button"
                    key={idx}
                    className={`choice ${state}`.trim()}
                    onClick={() => handleSelect(idx)}
                    disabled={answered}
                  >
                    <span className="choice__mark">{String.fromCharCode(65 + idx)}</span>
                    <span className="choice__body">
                      <InlineEmphasis text={choice} />
                    </span>
                    {answered && (isCorrect || isPicked) && (
                      <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }}>
                        {isCorrect ? (
                          <CheckIcon className="choice__end" />
                        ) : (
                          <XMarkIcon className="choice__end" />
                        )}
                      </motion.span>
                    )}
                  </button>
                );
              })}
            </div>

            <AnimatePresence>
              {answered && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className={`exercise-feedback${picked === correctIdx ? '' : ' is-wrong'}`}>
                    <p className="exercise-feedback__verdict">
                      {picked === correctIdx ? (
                        <>
                          <CheckIcon /> Correct
                        </>
                      ) : (
                        <>
                          <XMarkIcon /> Not quite
                        </>
                      )}
                    </p>
                    {activeItem.explanation && (
                      <p className="exercise-feedback__text">{activeItem.explanation}</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="exercise__nav">
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={goPrevious}
          disabled={activeIndex === 0}
        >
          <ChevronLeftIcon className="h-3.5 w-3.5" /> Previous
        </button>
        <button
          type="button"
          className="btn-ghost btn-sm"
          onClick={goNext}
          disabled={activeIndex >= total - 1}
        >
          Next <ChevronRightIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
