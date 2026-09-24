import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckIcon } from '@heroicons/react/24/outline';
import { useChatStore } from '@/lib/store';
import type { IntakeQuestion } from '@/modules/tutor/engine';
import type { MessageCards } from '@/modules/tutor/ui/messageViews';
import { contentVariants, safeKey } from '@/modules/tutor/components/message/shared';
import { StepperDots } from '@/modules/tutor/components/message/StepperDots';
import { useStepper } from '@/modules/tutor/components/message/hooks/useStepper';
import { InlineEmphasis } from '@/modules/tutor/components/message/InlineEmphasis';

type QuestionnaireItem = IntakeQuestion;

export function QuestionnaireCard({
  chatId,
  messageId,
  intake,
}: {
  chatId: string;
  messageId: string;
  intake: NonNullable<MessageCards['intake']>;
}) {
  // B2: the card reads the intake record directly; this keeps the old shape.
  const questionnaire = useMemo(
    () => ({
      questions: intake.questions,
      responses: intake.responses,
      submittedAt: intake.answeredAt,
    }),
    [intake],
  );
  const initialSelections = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const q of questionnaire.questions) {
      const prev = questionnaire.responses?.[q.id];
      map[q.id] = Array.isArray(prev) ? prev : [];
    }
    return map;
  }, [questionnaire]);
  const [selections, setSelections] = useState<Record<string, string[]>>(initialSelections);
  const [submitting, setSubmitting] = useState(false);
  const dispatchTutor = useChatStore((s) => s.dispatchTutor);
  const sendUserMessage = useChatStore((s) => s.sendUserMessage);
  const isSubmitted = !!intake.responses;
  const questionCount = questionnaire.questions.length;

  const isPending = useCallback(
    (question: QuestionnaireItem) => !(selections[question.id] ?? []).length,
    [selections],
  );
  const { activeIndex, setActiveIndex, goToIndex, goPrevious, goNext, activeItem } = useStepper(
    questionnaire.questions,
    isPending,
  );

  const firstIncompleteIndex = useMemo(() => {
    for (let i = 0; i < questionnaire.questions.length; i += 1) {
      const q = questionnaire.questions[i];
      const existing = initialSelections[q.id];
      if (!existing || existing.length === 0) return i;
    }
    return 0;
  }, [questionnaire.questions, initialSelections]);

  useEffect(() => {
    setSelections(initialSelections);
    setActiveIndex(firstIncompleteIndex);
  }, [initialSelections, firstIncompleteIndex, setActiveIndex]);

  const handleToggle = (questionId: string, choice: string, allowMultiple: boolean) => {
    if (isSubmitted) return;
    setSelections((prev) => {
      const current = prev[questionId] ?? [];
      if (allowMultiple) {
        const exists = current.includes(choice);
        return {
          ...prev,
          [questionId]: exists ? current.filter((c) => c !== choice) : [...current, choice],
        };
      }
      return {
        ...prev,
        [questionId]: [choice],
      };
    });
    if (!allowMultiple && !isSubmitted) {
      window.setTimeout(() => {
        setActiveIndex((prev) => {
          if (prev >= questionCount - 1) return prev;
          return prev + 1;
        });
      }, 250);
    }
  };

  const answeredCount = questionnaire.questions.reduce(
    (count, q) => (selections[q.id]?.length ? count + 1 : count),
    0,
  );
  const allAnswered = questionCount > 0 && answeredCount === questionCount;
  if (!questionCount || !activeItem) return null;
  const activeSelected = selections[activeItem.id] ?? [];
  const isCurrentAnswered = activeSelected.length > 0;
  const allowMultiple = !!activeItem.allowMultiple;

  const handleSubmit = async () => {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    try {
      const result = await dispatchTutor(
        chatId,
        { by: 'learner', type: 'answer_intake', intakeId: intake.intakeId, responses: selections },
        { by: 'learner', messageId },
      );
      if (!result.ok) return;
      // B2: a visible ledger line instead of a hidden message.
      await sendUserMessage('Answered the intake questions.', {
        metadata: {
          hiddenFromUser: true,
          kind: 'tutor_questionnaire_submission',
        },
      });
    } catch {
      // No-op
    } finally {
      setSubmitting(false);
    }
  };

  const submittedTimestamp =
    isSubmitted && questionnaire.submittedAt
      ? new Date(questionnaire.submittedAt).toLocaleTimeString()
      : null;

  return (
    <div className="exercise">
      <div>
        <h4 className="exercise__title">Tell me about your goals</h4>
        <p className="exercise__meta">
          {isSubmitted
            ? 'Thank you. The plan will be shaped around this.'
            : 'Choose the options that fit you best.'}
        </p>
      </div>

      <div className="exercise__bar">
        <span className="exercise__kicker">
          Question {activeIndex + 1} of {questionCount}
        </span>
        <StepperDots
          items={questionnaire.questions}
          activeIndex={activeIndex}
          resolveStatus={(question) => {
            if (isSubmitted) return 'answered';
            const selected = selections[question.id] ?? [];
            return selected.length > 0 ? 'answered' : 'pending';
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
            <div>
              {(activeItem.category || allowMultiple) && (
                <p className="exercise__tag mb-1">
                  {[activeItem.category, allowMultiple ? 'choose any' : null]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              )}
              <p className="exercise__question">
                <InlineEmphasis text={activeItem.question} />
              </p>
            </div>

            <div className="exercise__choices">
              {activeItem.options.map((option, idx) => {
                const isSelected = activeSelected.includes(option.label);
                const state = isSelected ? 'is-picked' : isSubmitted ? 'is-muted' : '';
                return (
                  <button
                    key={safeKey(option.label, idx, activeItem.id)}
                    type="button"
                    className={`choice ${state}`.trim()}
                    onClick={() => handleToggle(activeItem.id, option.label, allowMultiple)}
                    disabled={isSubmitted}
                    aria-pressed={isSelected}
                  >
                    <span className="choice__body">
                      <span>
                        <InlineEmphasis text={option.label} />
                      </span>
                      {option.description && (
                        <span className="choice__desc">
                          <InlineEmphasis text={option.description} />
                        </span>
                      )}
                    </span>
                    {isSelected && <CheckIcon className="choice__end" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {isSubmitted ? (
        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="exercise__done"
        >
          <CheckIcon />
          Answers sent{submittedTimestamp ? ` · ${submittedTimestamp}` : ''}
        </motion.p>
      ) : (
        <div className="exercise__nav">
          <span className="exercise__count">
            {answeredCount} of {questionCount} answered
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn-ghost btn-sm"
              onClick={goPrevious}
              disabled={activeIndex === 0}
            >
              Previous
            </button>
            {activeIndex === questionCount - 1 ? (
              <button
                type="button"
                className="btn btn-sm"
                onClick={handleSubmit}
                disabled={!allAnswered || submitting}
              >
                {submitting ? 'Sending…' : 'Send answers'}
              </button>
            ) : (
              <button
                type="button"
                className="btn-outline btn-sm"
                onClick={goNext}
                disabled={!isCurrentAnswered}
              >
                Next
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
