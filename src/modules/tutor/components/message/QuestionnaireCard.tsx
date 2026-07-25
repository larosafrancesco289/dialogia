'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckIcon, HandThumbUpIcon, QuestionMarkCircleIcon } from '@heroicons/react/24/outline';
import type { TutorQuestionnaire } from '@/lib/types';
import { useChatStore } from '@/lib/store';
import { contentVariants, safeKey } from '@/modules/tutor/components/message/shared';
import { StepperDots } from '@/modules/tutor/components/message/StepperDots';
import { useStepper } from '@/modules/tutor/components/message/hooks/useStepper';

type QuestionnaireItem = TutorQuestionnaire['questions'][number];

export function QuestionnaireCard({
  messageId,
  questionnaire,
}: {
  messageId: string;
  questionnaire: TutorQuestionnaire;
}) {
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
  const patchTutorEntry = useChatStore((s) => s.patchTutorEntry);
  const sendUserMessage = useChatStore((s) => s.sendUserMessage);
  const isSubmitted = questionnaire.status === 'submitted';
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
    const now = Date.now();
    try {
      const updatedQuestionnaire: TutorQuestionnaire = {
        ...questionnaire,
        status: 'submitted',
        submittedAt: now,
        responses: selections,
      };
      await patchTutorEntry(messageId, { questionnaire: updatedQuestionnaire });

      const content =
        questionCount === 1
          ? 'Submitted questionnaire response.'
          : `Submitted questionnaire responses (${questionCount}).`;
      await sendUserMessage(content, {
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
    <div className="marginalia">
      <div className="flex items-center gap-3 mb-4">
        <div className="rounded-full bg-[var(--color-accent)]/10 p-2">
          <QuestionMarkCircleIcon className="h-5 w-5 text-[var(--color-accent)]" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-tight text-[var(--color-fg)]">
            Tell me about your goals
          </span>
          <span className="text-xs text-[var(--color-fg-muted)]">
            {isSubmitted
              ? 'Thanks! I will tailor the plan with this in mind.'
              : 'Choose the options that best fit you.'}
          </span>
        </div>
      </div>

      <div className="rounded-[var(--radius-editorial)] border border-[var(--color-border)]/50 bg-[var(--color-muted)]/20 p-4">
        <div className="flex items-center justify-between text-xs text-[var(--color-fg-muted)] mb-4">
          <span>
            Question {activeIndex + 1} / {questionCount}
          </span>
          <StepperDots
            items={questionnaire.questions}
            activeIndex={activeIndex}
            resolveStatus={(question) => {
              if (isSubmitted) return 'correct';
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
              className="space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  {activeItem.category && (
                    <span className="badge badge-sm mr-2 uppercase tracking-wider bg-[var(--color-accent)]/10 text-[var(--color-accent)] border-[var(--color-accent)]/20">
                      {activeItem.category}
                    </span>
                  )}
                  <div className="text-base font-medium leading-relaxed mt-1 text-[var(--color-fg)]">
                    {activeItem.question}
                  </div>
                </div>
                {allowMultiple && (
                  <span className="text-xs text-[var(--color-fg-muted)] uppercase tracking-wider bg-[var(--color-muted)] px-1.5 py-0.5 rounded-[var(--radius-editorial)]">
                    Multi-select
                  </span>
                )}
              </div>

              <div className="grid gap-2">
                {activeItem.options.map((option, idx) => {
                  const isSelected = activeSelected.includes(option.label);
                  return (
                    <button
                      key={safeKey(option.label, idx, activeItem.id)}
                      className={`btn justify-start h-auto py-2.5 px-3 transition-all duration-200 ${
                        isSubmitted
                          ? isSelected
                            ? 'btn-primary opacity-90'
                            : 'btn-outline opacity-50'
                          : isSelected
                            ? 'btn-primary ring-2 ring-[var(--color-accent)]/20 ring-offset-1'
                            : 'btn-outline hover:bg-[var(--color-muted)]/50'
                      }`}
                      onClick={() => handleToggle(activeItem.id, option.label, allowMultiple)}
                      disabled={isSubmitted}
                    >
                      <div className="flex flex-col items-start text-left w-full">
                        <span className="font-medium text-sm">{option.label}</span>
                        {option.description && (
                          <span className="text-sm opacity-80 mt-0.5 font-normal">
                            {option.description}
                          </span>
                        )}
                      </div>
                      {isSelected && <CheckIcon className="h-4 w-4 ml-auto shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {isSubmitted ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 flex items-center gap-2 text-xs bg-[var(--color-success)]/10 text-[var(--color-success)] p-2 rounded-[var(--radius-editorial)] border border-[var(--color-success)]/20"
        >
          <HandThumbUpIcon className="h-4 w-4" />
          <span>
            Responses submitted{submittedTimestamp ? ` · ${submittedTimestamp}` : ''}. Let me
            incorporate this into your learning journey!
          </span>
        </motion.div>
      ) : (
        <div className="mt-4 flex items-center justify-between pt-2">
          <span className="text-xs text-[var(--color-fg-muted)] font-medium">
            {answeredCount}/{questionCount} answered
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={goPrevious}
              disabled={activeIndex === 0}
            >
              Previous
            </button>
            {activeIndex === questionCount - 1 ? (
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleSubmit}
                disabled={!allAnswered || submitting}
              >
                {submitting ? 'Submitting…' : 'Submit answers'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
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
