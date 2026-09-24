import { useCallback, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  CheckIcon,
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { useChatStore } from '@/lib/store';
import { quizFinished, type QuizItem, type QuizRecord } from '@/modules/tutor/engine';
import { contentVariants } from '@/modules/tutor/components/message/shared';
import { StepperDots } from '@/modules/tutor/components/message/StepperDots';
import { useStepper } from '@/modules/tutor/components/message/hooks/useStepper';
import { InlineEmphasis } from '@/modules/tutor/components/message/InlineEmphasis';
import { LEDGER } from '@/modules/tutor/lib/ledger';
import { useLedger } from '@/modules/tutor/ui/ledger';

export type McqItem = Omit<QuizItem, 'correct'> & { correct?: number };
export type McqAttempts = Record<string, { choice: number; correct: boolean }>;

/** A quiz card: each answer goes to the engine, which grades it and records the evidence. */
export function QuizCard({
  chatId,
  messageId,
  quiz,
}: {
  chatId: string;
  messageId: string;
  quiz: QuizRecord;
}) {
  const dispatchTutor = useChatStore((s) => s.dispatchTutor);
  const ledger = useLedger();
  const onAnswer = async (itemId: string, choice: number) => {
    const result = await dispatchTutor(
      chatId,
      { by: 'learner', type: 'answer_quiz_item', quizId: quiz.quizId, itemId, choice },
      { by: 'learner', messageId },
    );
    if (!result.ok) return;
    const before = result.before.quizzes[quiz.quizId];
    const after = result.state.quizzes[quiz.quizId];
    if (!after || !quizFinished(after) || (before && quizFinished(before))) return;
    const right = after.items.filter((item) => after.answers[item.id]?.correct).length;
    await ledger(LEDGER.quizFinished(right, after.items.length));
  };
  return <McqCard items={quiz.items} attempts={quiz.answers} onAnswer={onAnswer} />;
}

export function McqCard({
  items,
  attempts,
  onAnswer,
}: {
  items: McqItem[];
  attempts: McqAttempts;
  onAnswer: (itemId: string, choice: number) => void | Promise<void>;
}) {
  const isPending = useCallback((item: McqItem) => !attempts[item.id], [attempts]);
  const { total, activeIndex, goToIndex, goPrevious, goNext, activeItem } = useStepper(
    items,
    isPending,
  );
  const advanceTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (advanceTimer.current != null) {
        window.clearTimeout(advanceTimer.current);
        advanceTimer.current = null;
      }
    },
    [],
  );

  const activeAttempt = activeItem ? attempts[activeItem.id] : undefined;
  const picked = activeAttempt?.choice;
  const answered = !!activeAttempt;
  const correctIdx = typeof activeItem?.correct === 'number' ? activeItem.correct : -1;

  const handleSelect = (choiceIdx: number) => {
    if (!activeItem) return;
    if (answered) return;
    const correct = choiceIdx === correctIdx;
    void onAnswer(activeItem.id, choiceIdx);

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
            const attempt = attempts[item.id];
            if (!attempt) return 'pending';
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
