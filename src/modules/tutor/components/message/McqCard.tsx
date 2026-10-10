import { useCallback, useEffect, useRef, useState } from 'react';
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
import { Markdown } from '@/components/Markdown';
import { LEDGER } from '@/modules/tutor/lib/ledger';
import { useLedger } from '@/modules/tutor/ui/ledger';
import { useT } from '@/modules/tutor/i18n';

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
  const t = useT();
  const isPending = useCallback((item: McqItem) => !attempts[item.id], [attempts]);
  const { total, activeIndex, goToIndex, goPrevious, goNext, activeItem } = useStepper(
    items,
    isPending,
  );

  const activeAttempt = activeItem ? attempts[activeItem.id] : undefined;
  const answered = !!activeAttempt;
  // A tap only selects; the answer goes when it is checked, so a thumb that
  // lands on the wrong row while scrolling a phone commits nothing.
  const [selected, setSelected] = useState<number>();
  const [checking, setChecking] = useState(false);
  const picked = activeAttempt?.choice ?? selected;
  const correctIdx = typeof activeItem?.correct === 'number' ? activeItem.correct : -1;
  const choiceRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeId = activeItem?.id;

  useEffect(() => {
    setSelected(undefined);
  }, [activeId]);

  const handleSelect = (choiceIdx: number) => {
    if (!activeItem || answered || checking) return;
    setSelected(choiceIdx);
  };

  // The answer and its explanation stay until the learner presses Next, right or wrong.
  const check = async () => {
    if (!activeItem || answered || checking || selected === undefined) return;
    const choice = selected;
    setChecking(true);
    try {
      await onAnswer(activeItem.id, choice);
    } finally {
      setChecking(false);
    }
    // The Check button goes once answered: focus stays on the answer given,
    // where the verdict and its label are.
    choiceRefs.current[choice]?.focus();
  };

  if (!total || !activeItem) return null;
  // One question needs no counting and nowhere to step to.
  const single = total === 1;

  return (
    <div className="exercise">
      {!single && (
        <div className="exercise__bar">
          <span className="exercise__kicker">
            {t('quiz.question', { at: activeIndex + 1, count: total })}
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
      )}

      <div className={single ? 'relative' : 'relative min-h-[200px]'}>
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
              <Markdown inline content={activeItem.question} />
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
                // Said in words as well as colour and mark: the right answer,
                // and the learner's own when it was not.
                const graded = answered && (isCorrect || isPicked);

                return (
                  <button
                    type="button"
                    key={idx}
                    ref={(el) => {
                      choiceRefs.current[idx] = el;
                    }}
                    className={`choice ${state}`.trim()}
                    onClick={() => handleSelect(idx)}
                    // Not disabled once answered: a disabled button drops focus.
                    aria-disabled={answered || undefined}
                    aria-pressed={answered ? undefined : isPicked}
                  >
                    <span className="choice__mark">{String.fromCharCode(65 + idx)}</span>
                    <span className="choice__body">
                      <Markdown inline content={choice} />
                    </span>
                    {graded && (
                      <motion.span
                        className="choice__grade"
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                      >
                        <span className="choice__label">
                          {t(isCorrect ? 'quiz.rightAnswer' : 'quiz.yourAnswer')}
                        </span>
                        {isCorrect ? (
                          <CheckIcon className="choice__end" aria-hidden="true" />
                        ) : (
                          <XMarkIcon className="choice__end" aria-hidden="true" />
                        )}
                      </motion.span>
                    )}
                  </button>
                );
              })}
            </div>

            {!answered && (
              <div>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void check()}
                  disabled={selected === undefined || checking}
                >
                  {t('quiz.check')}
                </button>
              </div>
            )}

            {/* Always there, so the verdict is read out as it arrives. */}
            <div role="status">
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
                            <CheckIcon aria-hidden="true" /> {t('quiz.correct')}
                          </>
                        ) : (
                          <>
                            <XMarkIcon aria-hidden="true" /> {t('quiz.notQuite')}
                          </>
                        )}
                      </p>
                      {activeItem.explanation && (
                        <p className="exercise-feedback__text">
                          <Markdown inline content={activeItem.explanation} />
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {!single && (
        <div className="exercise__nav">
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={goPrevious}
            disabled={activeIndex === 0}
          >
            <ChevronLeftIcon className="h-3.5 w-3.5" /> {t('common.previous')}
          </button>
          <button
            type="button"
            className="btn-ghost btn-sm"
            onClick={goNext}
            disabled={activeIndex >= total - 1}
          >
            {t('common.next')} <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
