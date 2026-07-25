'use client';
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
import { contentVariants } from '@/components/message/tutor/shared';
import { StepperDots } from '@/components/message/tutor/StepperDots';
import { useStepper } from '@/components/message/tutor/hooks/useStepper';

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
    <div className="space-y-4">
      <div className="marginalia">
        <div className="flex items-center justify-between text-sm text-muted-foreground mb-4">
          <span className="font-medium uppercase tracking-wider">
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
              className="space-y-4"
            >
              <div className="text-base font-medium leading-relaxed mb-2">
                {activeItem.question}
              </div>
              <div className="grid gap-3">
                {activeItem.choices.map((choice, idx) => {
                  const isPicked = picked === idx;
                  const isCorrect = correctIdx === idx;
                  let btnClass = 'btn-outline hover:bg-muted/50';

                  if (answered) {
                    if (isCorrect) btnClass = 'feedback-correct border';
                    else if (isPicked) btnClass = 'feedback-incorrect border';
                    else btnClass = 'btn-outline opacity-50';
                  } else if (isPicked) {
                    btnClass = 'btn-primary';
                  }

                  return (
                    <button
                      type="button"
                      key={idx}
                      className={`btn justify-start relative overflow-hidden transition-all duration-200 py-3 ${btnClass} ${answered ? 'cursor-default' : ''}`}
                      onClick={() => handleSelect(idx)}
                      disabled={answered}
                    >
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold mr-3 ${
                          answered && isCorrect
                            ? 'feedback-correct-icon'
                            : answered && isPicked
                              ? 'feedback-incorrect-icon'
                              : 'border-current opacity-60'
                        }`}
                      >
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className="text-left">{choice}</span>
                      {answered && (isCorrect || isPicked) && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="absolute right-3 top-1/2 -translate-y-1/2"
                        >
                          {isCorrect ? (
                            <CheckIcon
                              className="h-4 w-4"
                              style={{ color: 'var(--color-success)' }}
                            />
                          ) : (
                            <XMarkIcon
                              className="h-4 w-4"
                              style={{ color: 'var(--color-danger)' }}
                            />
                          )}
                        </motion.div>
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
                    <div
                      className={`rounded-lg p-4 border ${
                        picked === correctIdx ? 'feedback-correct' : 'feedback-incorrect'
                      }`}
                    >
                      <div className="font-bold mb-1.5 flex items-center gap-2 text-base">
                        {picked === correctIdx ? (
                          <>
                            <CheckIcon className="h-4 w-4" /> Correct
                          </>
                        ) : (
                          <>
                            <XMarkIcon className="h-4 w-4" /> Incorrect
                          </>
                        )}
                      </div>
                      {activeItem.explanation && (
                        <div className="opacity-90 leading-relaxed">{activeItem.explanation}</div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-border/40 pt-4">
          <button
            type="button"
            className="btn btn-ghost btn-sm gap-1 pl-0 text-muted-foreground hover:text-foreground"
            onClick={goPrevious}
            disabled={activeIndex === 0}
          >
            <ChevronLeftIcon className="h-3 w-3" /> Previous
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm gap-1 pr-0 text-muted-foreground hover:text-foreground"
            onClick={goNext}
            disabled={activeIndex >= total - 1}
          >
            Next <ChevronRightIcon className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
