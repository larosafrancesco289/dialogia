'use client';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckIcon,
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import type { TutorFillBlankItem } from '@/lib/types';
import { useChatStore } from '@/lib/store';
import { contentVariants } from '@/components/message/tutor/shared';
import { StepperDots } from '@/components/message/tutor/StepperDots';
import { useStepper } from '@/components/message/tutor/hooks/useStepper';

export function FillBlankCard({
  items,
  messageId,
}: {
  items: TutorFillBlankItem[];
  messageId: string;
}) {
  const log = useChatStore((s) => s.logTutorResult);
  const setTutorAttemptFillBlank = useChatStore((s) => s.setTutorAttemptFillBlank);
  const patchTutorEntry = useChatStore((s) => s.patchTutorEntry);
  const sendUserMessage = useChatStore((s) => s.sendUserMessage);
  const tutorEntry = useChatStore((s) => s.ui.tutor.byMessageId?.[messageId]);
  const attempts = tutorEntry?.attempts;
  const fb = useMemo(
    () =>
      (attempts?.fillBlank as Record<
        string,
        { answer?: string; revealed?: boolean; correct?: boolean }
      >) || {},
    [attempts],
  );
  const normalize = (value: string) => value.trim().toLowerCase();
  const isAccepted = (item: TutorFillBlankItem, value: string) => {
    const v = normalize(value);
    if (normalize(item.answer) === v) return true;
    if (Array.isArray(item.aliases)) return item.aliases.some((a) => normalize(a) === v);
    return false;
  };
  const isPending = useCallback((item: TutorFillBlankItem) => !fb[item.id]?.revealed, [fb]);
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

  const revealedCount = useMemo(
    () => items.filter((item) => fb[item.id]?.revealed).length,
    [items, fb],
  );
  const correctCount = useMemo(
    () => items.filter((item) => fb[item.id]?.revealed && fb[item.id]?.correct).length,
    [items, fb],
  );

  useEffect(() => {
    if (total === 0 || revealedCount !== total) return;
    if (completionStarted.current) return;
    if (typeof tutorEntry?.quizMeta?.completedAt === 'number') return;
    completionStarted.current = true;

    const now = Date.now();
    const prevQuizMeta = tutorEntry?.quizMeta || {};
    void patchTutorEntry(messageId, {
      quizMeta: {
        ...prevQuizMeta,
        completedAt: now,
        type: 'fill_blank',
      },
    })
      .then(() =>
        sendUserMessage(`Completed fill-blank quiz (${correctCount}/${total} correct).`, {
          metadata: {
            hiddenFromUser: true,
            kind: 'tutor_quiz_completion',
          },
        }),
      )
      .catch(() => {
        completionStarted.current = false;
      });
  }, [correctCount, messageId, patchTutorEntry, revealedCount, sendUserMessage, total, tutorEntry]);

  if (!total || !activeItem) return null;

  const activeAttempt = fb[activeItem.id] || {};
  const value = activeAttempt.answer ?? '';
  const revealed = !!activeAttempt.revealed;
  const correct = !!activeAttempt.correct;

  const persistAnswer = (nextValue: string) => {
    setTutorAttemptFillBlank(
      messageId,
      activeItem.id,
      nextValue,
      activeAttempt.revealed,
      undefined,
    );
  };

  const revealAnswer = () => {
    if (revealed) return;
    const answer = String(value || '').trim();
    if (!answer) return;
    const ok = isAccepted(activeItem, answer);
    log({
      kind: 'fill_blank',
      itemId: activeItem.id,
      correct: ok,
      topic: activeItem.topic,
      skill: activeItem.skill,
      difficulty: activeItem.difficulty,
    });
    setTutorAttemptFillBlank(messageId, activeItem.id, answer, true, ok);

    if (advanceTimer.current != null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    if (ok && activeIndex < total - 1) {
      advanceTimer.current = window.setTimeout(() => {
        goToIndex(activeIndex + 1);
        advanceTimer.current = null;
      }, 1200);
    }
  };

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
              const attempt = fb[item.id];
              if (attempt?.revealed) return attempt.correct ? 'correct' : 'incorrect';
              return attempt?.answer ? 'answered' : 'pending';
            }}
            onSelect={goToIndex}
          />
        </div>

        <div className="relative min-h-[150px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeItem.id}
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-4"
            >
              <div className="text-base font-medium leading-relaxed">{activeItem.prompt}</div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <input
                    className={`input w-full pr-10 ${
                      revealed
                        ? correct
                          ? 'feedback-correct border'
                          : 'feedback-incorrect border'
                        : ''
                    }`}
                    placeholder="Type your answer..."
                    value={value}
                    onChange={(event) => persistAnswer(event.currentTarget.value)}
                    disabled={revealed}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !revealed && String(value || '').trim()) {
                        revealAnswer();
                      }
                    }}
                  />
                  {revealed && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {correct ? (
                        <CheckIcon className="h-4 w-4" style={{ color: 'var(--color-success)' }} />
                      ) : (
                        <XMarkIcon className="h-4 w-4" style={{ color: 'var(--color-danger)' }} />
                      )}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={`btn ${revealed ? 'btn-ghost opacity-50' : 'btn-primary'}`}
                  onClick={revealAnswer}
                  disabled={revealed || !String(value || '').trim()}
                >
                  Check
                </button>
              </div>

              <AnimatePresence>
                {revealed && !correct && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-lg border p-3 feedback-incorrect">
                      <div className="font-bold mb-1">Correct Answer:</div>
                      <div className="font-mono bg-surface/50 p-1.5 rounded w-fit mb-2">
                        {activeItem.answer}
                      </div>
                      {activeItem.explanation && (
                        <div className="opacity-90 leading-relaxed text-sm">
                          {activeItem.explanation}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
                {revealed && correct && activeItem.explanation && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-lg border p-3 feedback-correct">
                      <div className="font-bold mb-1">Explanation:</div>
                      <div className="opacity-90 leading-relaxed text-sm">
                        {activeItem.explanation}
                      </div>
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
