'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AcademicCapIcon,
  CheckIcon,
  XMarkIcon,
  EyeIcon,
  QuestionMarkCircleIcon,
  ClipboardDocumentCheckIcon,
  ChartBarIcon,
  ArrowPathIcon,
  HandThumbUpIcon,
  SparklesIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  ArrowUpIcon,
} from '@heroicons/react/24/outline';
import type {
  TutorMCQItem,
  TutorFillBlankItem,
  TutorOpenItem,
  TutorFlashcardItem,
  TutorQuestionnaire,
  TutorDiagnostic,
  TutorPlanProposal,
  TutorPlanSuggestion,
  TutorLearnerModelUpdate,
} from '@/lib/types';
import { useChatStore } from '@/lib/store';
import { getNextNode, updateNodeStatus } from '@/lib/learningPlan/service';

function safeKey(val: any, idx: number, prefix = 'item'): string {
  const s = typeof val === 'string' ? val.trim() : '';
  const base = !s || s === 'null' || s === 'undefined' ? prefix : s;
  return `${base}-${idx}`;
}

type StepStatus = 'pending' | 'correct' | 'incorrect' | 'answered';

const cardVariants = {
  hidden: { opacity: 0, y: 10, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, scale: 0.98, transition: { duration: 0.2 } },
};

const contentVariants = {
  hidden: { opacity: 0, x: 10 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.3 } },
  exit: { opacity: 0, x: -10, transition: { duration: 0.2 } },
};

function StepperDots<T>({
  items,
  activeIndex,
  resolveStatus,
  onSelect,
}: {
  items: T[];
  activeIndex: number;
  resolveStatus: (item: T, index: number) => StepStatus;
  onSelect: (index: number) => void;
}) {
  if (!Array.isArray(items) || items.length === 0) return null;
  return (
    <div className="flex items-center gap-1.5">
      {items.map((item, idx) => {
        const status = resolveStatus(item, idx);
        const isActive = idx === activeIndex;

        let colorClass = 'bg-muted border-border';
        if (status === 'correct') colorClass = 'bg-emerald-500 border-emerald-500';
        else if (status === 'incorrect') colorClass = 'bg-rose-500 border-rose-500';
        else if (status === 'answered') colorClass = 'bg-primary/60 border-primary/60';
        else if (isActive) colorClass = 'bg-primary border-primary';

        return (
          <button
            type="button"
            key={idx}
            className={`h-2 w-2 rounded-full border transition-all duration-300 ${colorClass} ${isActive ? 'scale-125 ring-2 ring-primary/20 ring-offset-1' : 'opacity-70 hover:opacity-100'
              }`}
            onClick={() => onSelect(idx)}
            aria-label={`Go to item ${idx + 1}`}
          />
        );
      })}
    </div>
  );
}

export function TutorPanel(props: {
  messageId: string;
  title?: string;
  mcq?: TutorMCQItem[];
  fillBlank?: TutorFillBlankItem[];
  openEnded?: TutorOpenItem[];
  flashcards?: TutorFlashcardItem[];
  questionnaire?: TutorQuestionnaire;
  diagnostic?: TutorDiagnostic;
  planProposal?: TutorPlanProposal;
  planSuggestions?: TutorPlanSuggestion[];
  assessmentUpdates?: TutorLearnerModelUpdate[];
  grading?: Record<string, { score?: number; feedback: string; criteria?: string[] }>;
}) {
  const {
    messageId,
    title,
    mcq,
    fillBlank,
    openEnded,
    flashcards,
    questionnaire,
    diagnostic,
    planProposal,
    planSuggestions,
    assessmentUpdates,
    grading,
  } = props;

  const hasAny =
    (questionnaire && questionnaire.questions && questionnaire.questions.length > 0) ||
    planProposal ||
    (planSuggestions && planSuggestions.length > 0) ||
    (diagnostic && diagnostic.items && diagnostic.items.length > 0) ||
    (assessmentUpdates && assessmentUpdates.length > 0) ||
    (mcq && mcq.length > 0) ||
    (fillBlank && fillBlank.length > 0) ||
    (openEnded && openEnded.length > 0) ||
    (flashcards && flashcards.length > 0) ||
    (grading && Object.keys(grading).length > 0);

  if (!hasAny) return null;

  return (
    <div className="px-4 py-2">
      <motion.div
        initial="hidden"
        animate="visible"
        variants={cardVariants}
        className="overflow-hidden rounded-xl border border-border/50 bg-surface/40 backdrop-blur-sm shadow-sm"
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border/40 bg-muted/20">
          <div className="flex items-center gap-2 min-w-0 text-muted-foreground">
            <AcademicCapIcon className="h-4 w-4" />
            <div className="text-xs font-bold uppercase tracking-wider truncate">{title || 'Tutor Tools'}</div>
          </div>
        </div>
        <div className="p-4 space-y-6">
          {questionnaire && questionnaire.questions?.length ? (
            <QuestionnaireCard messageId={messageId} questionnaire={questionnaire} />
          ) : null}
          {planProposal ? (
            <PlanProposalCard
              messageId={messageId}
              proposal={planProposal}
              suggestions={planSuggestions}
            />
          ) : null}
          {!planProposal && planSuggestions && planSuggestions.length > 0 ? (
            <PlanSuggestionsCard suggestions={planSuggestions} />
          ) : null}
          {diagnostic && diagnostic.items?.length ? (
            <DiagnosticCard messageId={messageId} diagnostic={diagnostic} />
          ) : null}
          {mcq && mcq.length > 0 && <MCQList messageId={messageId} items={mcq} />}
          {fillBlank && fillBlank.length > 0 && (
            <FillBlankList messageId={messageId} items={fillBlank} />
          )}
          {openEnded && openEnded.length > 0 && (
            <OpenEndedList messageId={messageId} items={openEnded} grading={grading} />
          )}
          {flashcards && flashcards.length > 0 && <FlashcardList items={flashcards} />}
          {assessmentUpdates && assessmentUpdates.length > 0 && (
            <LearnerUpdatesCard updates={assessmentUpdates} />
          )}
          {grading && Object.keys(grading).length > 0 && (
            <div className="rounded-lg border border-border/60 bg-surface/50 p-4">
              <div className="text-sm font-medium mb-3 flex items-center gap-2">
                <ClipboardDocumentCheckIcon className="h-4 w-4 text-primary" />
                Grading Feedback
              </div>
              <div className="space-y-4 text-sm">
                {Object.entries(grading).map(([id, g], idx) => (
                  <div key={safeKey(id, idx, 'grade')} className="space-y-1">
                    <div className="font-medium text-foreground">
                      Item {id}
                      {g.score != null ? ` · Score: ${Math.round(g.score * 100)}%` : ''}
                    </div>
                    <div className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{g.feedback}</div>
                    {Array.isArray(g.criteria) && g.criteria.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {g.criteria.map((c, i) => (
                          <span key={i} className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {c}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function MCQList({ items, messageId }: { items: TutorMCQItem[]; messageId: string }) {
  const log = useChatStore((s) => s.logTutorResult);
  const setUI = useChatStore((s) => s.setUI);
  const persistTutor = useChatStore((s) => s.persistTutorStateForMessage);
  const tutorMap = useChatStore((s) => s.ui.tutorByMessageId || {});
  const attempts = useMemo(() => (tutorMap[messageId]?.attempts as any) || {}, [tutorMap, messageId]);
  const mcq = useMemo(
    () =>
      (attempts.mcq as Record<string, { choice?: number; done?: boolean; correct?: boolean }>) || {},
    [attempts],
  );
  const total = items.length;
  const firstPendingIndex = useMemo(() => {
    for (let i = 0; i < total; i += 1) {
      const item = items[i];
      if (!item) continue;
      if (!mcq[item.id]?.done) return i;
    }
    return total > 0 ? 0 : -1;
  }, [items, mcq, total]);

  const [activeIndex, setActiveIndex] = useState(
    firstPendingIndex >= 0 ? firstPendingIndex : 0,
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

  useEffect(() => {
    if (total === 0) return;
    if (activeIndex < total) return;
    setActiveIndex(Math.max(total - 1, 0));
  }, [total, activeIndex]);

  useEffect(() => {
    if (total === 0) return;
    const active = items[activeIndex];
    if (active) return;
    if (firstPendingIndex >= 0) {
      setActiveIndex(firstPendingIndex);
    } else if (total > 0) {
      setActiveIndex((prev) => Math.min(prev, total - 1));
    }
  }, [items, total, activeIndex, firstPendingIndex]);

  const activeItem = total > 0 ? items[Math.min(activeIndex, total - 1)] : null;
  const activeAttempt = activeItem ? mcq[activeItem.id] || {} : {};
  const picked = activeAttempt.choice;
  const answered = !!activeAttempt.done;
  const correctIdx = typeof activeItem?.correct === 'number' ? activeItem.correct : -1;

  const goToIndex = useCallback(
    (idx: number) => {
      if (!total) return;
      if (idx < 0) idx = 0;
      if (idx >= total) idx = total - 1;
      setActiveIndex(idx);
    },
    [total],
  );

  const goPrevious = useCallback(() => goToIndex(activeIndex - 1), [activeIndex, goToIndex]);
  const goNext = useCallback(() => goToIndex(activeIndex + 1), [activeIndex, goToIndex]);

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
    const st = (useChatStore as any).getState();
    const prev = (st.ui.tutorByMessageId || {})[messageId] || {};
    const prevAttempts = (prev as any).attempts || {};
    const prevMcq = (prevAttempts.mcq || {}) as Record<string, any>;
    const nextMcq = { ...prevMcq, [activeItem.id]: { choice: choiceIdx, done: true, correct } };
    setUI({
      tutorByMessageId: {
        ...(st.ui.tutorByMessageId || {}),
        [messageId]: {
          ...prev,
          attempts: {
            ...prevAttempts,
            mcq: nextMcq,
          },
        },
      },
    });
    persistTutor(messageId).catch(() => void 0);

    if (advanceTimer.current != null) {
      window.clearTimeout(advanceTimer.current);
      advanceTimer.current = null;
    }
    if (correct && activeIndex < total - 1) {
      advanceTimer.current = window.setTimeout(() => {
        goToIndex(activeIndex + 1);
        advanceTimer.current = null;
      }, 1200); // Longer delay to read feedback
    }
  };

  if (!total || !activeItem) return null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-surface/50 p-4 shadow-sm">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
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
              <div className="text-sm font-medium leading-relaxed">
                {activeItem.question}
              </div>
              <div className="grid gap-2.5">
                {activeItem.choices.map((choice, idx) => {
                  const isPicked = picked === idx;
                  const isCorrect = correctIdx === idx;
                  let btnClass = 'btn-outline hover:bg-muted/50';

                  if (answered) {
                    if (isCorrect) btnClass = 'bg-emerald-500/10 border-emerald-500/50 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20';
                    else if (isPicked) btnClass = 'bg-rose-500/10 border-rose-500/50 text-rose-700 dark:text-rose-400 hover:bg-rose-500/20';
                    else btnClass = 'btn-outline opacity-50';
                  } else if (isPicked) {
                    btnClass = 'btn-primary';
                  }

                  return (
                    <button
                      type="button"
                      key={idx}
                      className={`btn justify-start relative overflow-hidden transition-all duration-200 ${btnClass} ${answered ? 'cursor-default' : ''}`}
                      onClick={() => handleSelect(idx)}
                      disabled={answered}
                    >
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold mr-3 ${answered && isCorrect ? 'border-emerald-500 bg-emerald-500 text-white' :
                        answered && isPicked ? 'border-rose-500 bg-rose-500 text-white' :
                          'border-current opacity-60'
                        }`}>
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
                            <CheckIcon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <XMarkIcon className="h-4 w-4 text-rose-600 dark:text-rose-400" />
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
                    <div className={`rounded-lg p-3 text-xs ${picked === correctIdx
                      ? 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 border border-emerald-500/20'
                      : 'bg-rose-500/10 text-rose-800 dark:text-rose-300 border border-rose-500/20'
                      }`}>
                      <div className="font-bold mb-1 flex items-center gap-1.5">
                        {picked === correctIdx ? (
                          <><CheckIcon className="h-3.5 w-3.5" /> Correct</>
                        ) : (
                          <><XMarkIcon className="h-3.5 w-3.5" /> Incorrect</>
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

function FillBlankList({ items, messageId }: { items: TutorFillBlankItem[]; messageId: string }) {
  const log = useChatStore((s) => s.logTutorResult);
  const setUI = useChatStore((s) => s.setUI);
  const persistTutor = useChatStore((s) => s.persistTutorStateForMessage);
  const tutorMap = useChatStore((s) => s.ui.tutorByMessageId || {});
  const attempts = useMemo(() => (tutorMap[messageId]?.attempts as any) || {}, [tutorMap, messageId]);
  const fb = useMemo(
    () =>
      (attempts.fillBlank as Record<
        string,
        { answer?: string; revealed?: boolean; correct?: boolean }
      >) || {},
    [attempts],
  );
  const normalize = (s: string) => s.trim().toLowerCase();
  const isAccepted = (it: TutorFillBlankItem, val: string) => {
    const v = normalize(val);
    if (normalize(it.answer) === v) return true;
    if (Array.isArray(it.aliases)) return it.aliases.some((a) => normalize(a) === v);
    return false;
  };
  const total = items.length;
  const firstPendingIndex = useMemo(() => {
    for (let i = 0; i < total; i += 1) {
      const item = items[i];
      if (!item) continue;
      const attempt = fb[item.id];
      if (!attempt?.revealed) return i;
    }
    return total > 0 ? 0 : -1;
  }, [items, fb, total]);
  const [activeIndex, setActiveIndex] = useState(() =>
    firstPendingIndex >= 0 ? firstPendingIndex : 0,
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

  useEffect(() => {
    if (total === 0) return;
    if (activeIndex < total) return;
    setActiveIndex(Math.max(total - 1, 0));
  }, [total, activeIndex]);

  useEffect(() => {
    if (total === 0) return;
    const active = items[activeIndex];
    if (active) return;
    if (firstPendingIndex >= 0) {
      setActiveIndex(firstPendingIndex);
    } else if (total > 0) {
      setActiveIndex((prev) => Math.min(prev, total - 1));
    }
  }, [items, total, activeIndex, firstPendingIndex]);

  if (!total) return null;

  const activeItem = items[Math.min(activeIndex, total - 1)];
  if (!activeItem) return null;

  const activeAttempt = fb[activeItem.id] || {};
  const value = activeAttempt.answer ?? '';
  const revealed = !!activeAttempt.revealed;
  const correct = !!activeAttempt.correct;

  const goToIndex = (idx: number) => {
    if (!Number.isFinite(idx)) return;
    setActiveIndex((prev) => {
      if (!total) return prev;
      if (idx < 0) return 0;
      if (idx >= total) return total - 1;
      return idx;
    });
  };

  const goPrevious = () => goToIndex(activeIndex - 1);
  const goNext = () => goToIndex(activeIndex + 1);

  const persistAnswer = (nextValue: string) => {
    const st = (useChatStore as any).getState();
    const prev = (st.ui.tutorByMessageId || {})[messageId] || {};
    const prevAttempts = (prev as any).attempts || {};
    const prevFill = (prevAttempts.fillBlank || {}) as Record<string, any>;
    setUI({
      tutorByMessageId: {
        ...(st.ui.tutorByMessageId || {}),
        [messageId]: {
          ...prev,
          attempts: {
            ...prevAttempts,
            fillBlank: {
              ...prevFill,
              [activeItem.id]: { ...(prevFill[activeItem.id] || {}), answer: nextValue },
            },
          },
        },
      },
    });
    persistTutor(messageId).catch(() => void 0);
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
    const st = (useChatStore as any).getState();
    const prev = (st.ui.tutorByMessageId || {})[messageId] || {};
    const prevAttempts = (prev as any).attempts || {};
    const prevFill = (prevAttempts.fillBlank || {}) as Record<string, any>;
    setUI({
      tutorByMessageId: {
        ...(st.ui.tutorByMessageId || {}),
        [messageId]: {
          ...prev,
          attempts: {
            ...prevAttempts,
            fillBlank: {
              ...prevFill,
              [activeItem.id]: {
                ...(prevFill[activeItem.id] || {}),
                answer,
                revealed: true,
                correct: ok,
              },
            },
          },
        },
      },
    });
    persistTutor(messageId).catch(() => void 0);

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
      <div className="rounded-xl border border-border/60 bg-surface/50 p-4 shadow-sm">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
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
              <div className="text-sm font-medium leading-relaxed">
                {activeItem.prompt}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <input
                    className={`input w-full pr-10 ${revealed
                      ? correct
                        ? 'border-emerald-500/50 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
                        : 'border-rose-500/50 bg-rose-500/5 text-rose-700 dark:text-rose-300'
                      : ''
                      }`}
                    placeholder="Type your answer..."
                    value={value}
                    onChange={(event) => persistAnswer(event.currentTarget.value)}
                    disabled={revealed}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !revealed && String(value || '').trim()) {
                        revealAnswer();
                      }
                    }}
                  />
                  {revealed && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {correct ? (
                        <CheckIcon className="h-4 w-4 text-emerald-500" />
                      ) : (
                        <XMarkIcon className="h-4 w-4 text-rose-500" />
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
                    <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs text-rose-800 dark:text-rose-300">
                      <div className="font-bold mb-1">Correct Answer:</div>
                      <div className="font-mono bg-white/50 dark:bg-black/20 p-1.5 rounded w-fit mb-2">
                        {activeItem.answer}
                      </div>
                      {activeItem.explanation && (
                        <div className="opacity-90 leading-relaxed">{activeItem.explanation}</div>
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
                    <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                      <div className="font-bold mb-1">Explanation:</div>
                      <div className="opacity-90 leading-relaxed">{activeItem.explanation}</div>
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

function OpenEndedList({
  items,
  grading,
  messageId,
}: {
  items: TutorOpenItem[];
  grading?: Record<string, { score?: number; feedback: string; criteria?: string[] }>;
  messageId: string;
}) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const setUI = useChatStore((s) => s.setUI);
  const send = useChatStore((s) => s.sendUserMessage);
  const persistTutor = useChatStore((s) => s.persistTutorStateForMessage);
  const tutorMap = useChatStore((s) => s.ui.tutorByMessageId || {});
  const attempts = useMemo(() => (tutorMap[messageId]?.attempts as any) || {}, [tutorMap, messageId]);
  const open = useMemo(
    () => (attempts.open as Record<string, { answer?: string }>) || {},
    [attempts],
  );
  const total = items.length;
  const firstPendingIndex = useMemo(() => {
    for (let i = 0; i < total; i += 1) {
      const item = items[i];
      if (!item) continue;
      const attempt = open[item.id];
      if (!attempt?.answer || !attempt.answer.trim()) return i;
    }
    return total > 0 ? 0 : -1;
  }, [items, open, total]);
  const [activeIndex, setActiveIndex] = useState(() =>
    firstPendingIndex >= 0 ? firstPendingIndex : 0,
  );

  useEffect(() => {
    if (total === 0) return;
    if (activeIndex < total) return;
    setActiveIndex(Math.max(total - 1, 0));
  }, [total, activeIndex]);

  useEffect(() => {
    if (total === 0) return;
    const active = items[activeIndex];
    if (active) return;
    if (firstPendingIndex >= 0) {
      setActiveIndex(firstPendingIndex);
    } else if (total > 0) {
      setActiveIndex((prev) => Math.min(prev, total - 1));
    }
  }, [items, total, activeIndex, firstPendingIndex]);

  if (!total) return null;

  const activeItem = items[Math.min(activeIndex, total - 1)];
  if (!activeItem) return null;

  const answer = (open[activeItem.id]?.answer ?? '') as string;
  const goToIndex = (idx: number) => {
    if (!Number.isFinite(idx)) return;
    setActiveIndex((prev) => {
      if (!total) return prev;
      if (idx < 0) return 0;
      if (idx >= total) return total - 1;
      return idx;
    });
  };
  const goPrevious = () => goToIndex(activeIndex - 1);
  const goNext = () => goToIndex(activeIndex + 1);

  const persistAnswer = (value: string) => {
    const st = (useChatStore as any).getState();
    const prev = (st.ui.tutorByMessageId || {})[messageId] || {};
    const prevAttempts = (prev as any).attempts || {};
    const prevOpen = (prevAttempts.open || {}) as Record<string, any>;
    setUI({
      tutorByMessageId: {
        ...(st.ui.tutorByMessageId || {}),
        [messageId]: {
          ...prev,
          attempts: {
            ...prevAttempts,
            open: {
              ...prevOpen,
              [activeItem.id]: { ...(prevOpen[activeItem.id] || {}), answer: value },
            },
          },
        },
      },
    });
    persistTutor(messageId).catch(() => void 0);
  };

  const requestFeedback = () => {
    const trimmed = String(answer || '').trim();
    if (!trimmed) return;
    const prompt = activeItem.prompt.replace(/\n/g, ' ').slice(0, 200);
    const msg = `Please grade my answer for open-ended item ${activeItem.id} ("${prompt}").\nAnswer: ${trimmed}\nUse the tool grade_open_response with item_id and feedback (and optional score).`;
    send(msg).catch(() => void 0);
  };

  const gradingEntry = grading && grading[activeItem.id];
  const isSampleVisible = !!revealed[activeItem.id];

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-surface/50 p-4 shadow-sm">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
          <span className="font-medium uppercase tracking-wider">
            Question {activeIndex + 1} of {total}
          </span>
          <StepperDots
            items={items}
            activeIndex={activeIndex}
            resolveStatus={(item) => {
              const attempt = open[item.id];
              if (grading && grading[item.id]) {
                const entry = grading[item.id]!;
                if (typeof entry.score === 'number') {
                  return entry.score >= 0.95 ? 'correct' : 'answered';
                }
                return 'answered';
              }
              return attempt?.answer && attempt.answer.trim() ? 'answered' : 'pending';
            }}
            onSelect={goToIndex}
          />
        </div>

        <div className="relative min-h-[250px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeItem.id}
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="text-sm font-medium leading-relaxed">
                  {activeItem.prompt}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-xs text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() =>
                    setRevealed((state) => ({ ...state, [activeItem.id]: !state[activeItem.id] }))
                  }
                >
                  <EyeIcon className="h-3.5 w-3.5 mr-1" />
                  {isSampleVisible ? 'Hide' : 'Show'} sample
                </button>
              </div>

              <AnimatePresence>
                {isSampleVisible && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-3 text-xs text-muted-foreground mb-4">
                      {activeItem.sample_answer ? (
                        <div>
                          <div className="font-bold mb-1 text-foreground">Sample answer</div>
                          <div className="whitespace-pre-wrap leading-relaxed">
                            {activeItem.sample_answer}
                          </div>
                        </div>
                      ) : activeItem.rubric ? (
                        <div>
                          <div className="font-bold mb-1 text-foreground">Rubric</div>
                          <div className="whitespace-pre-wrap leading-relaxed">{activeItem.rubric}</div>
                        </div>
                      ) : null}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex flex-col gap-3">
                <textarea
                  className="textarea flex-1 text-sm min-h-[120px] resize-y"
                  placeholder="Type your response..."
                  value={answer}
                  onChange={(event) => persistAnswer(event.currentTarget.value)}
                />
                <div className="flex flex-wrap items-center gap-2 justify-between">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={requestFeedback}
                    disabled={!answer.trim()}
                  >
                    Get feedback
                  </button>
                  {gradingEntry && (
                    <span className="text-xs font-medium text-muted-foreground">
                      Last graded {gradingEntry.score != null
                        ? `· ${Math.round((gradingEntry.score || 0) * 100)}%`
                        : ''}
                    </span>
                  )}
                </div>
              </div>

              <AnimatePresence>
                {gradingEntry && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                      <div className="font-bold mb-1 flex items-center gap-2">
                        <SparklesIcon className="h-4 w-4 text-primary" />
                        Feedback
                        {gradingEntry.score != null && (
                          <span className="badge badge-sm bg-primary/20 text-primary border-transparent">
                            {Math.round((gradingEntry.score || 0) * 100)}%
                          </span>
                        )}
                      </div>
                      <div className="text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {gradingEntry.feedback}
                      </div>
                      {Array.isArray(gradingEntry.criteria) && gradingEntry.criteria!.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {gradingEntry.criteria!.map((c, i) => (
                            <span key={i} className="inline-flex items-center rounded-full bg-surface border border-border px-2 py-0.5 text-[10px] text-muted-foreground">
                              {c}
                            </span>
                          ))}
                        </div>
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

function FlashcardList({ items }: { items: TutorFlashcardItem[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const log = useChatStore((s) => s.logTutorResult);
  const send = useChatStore((s) => s.sendUserMessage);
  const total = items.length;
  const cur = items[Math.min(index, total - 1)];

  if (!cur) return null;

  return (
    <div className="rounded-xl border border-border/60 bg-surface/50 p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-4 flex justify-between items-center">
        <span>Flashcard {index + 1} of {total}</span>
        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">Click to flip</span>
      </div>

      <div className="perspective-1000 relative h-64 w-full cursor-pointer group" onClick={() => setFlipped(!flipped)}>
        <motion.div
          className="relative h-full w-full preserve-3d transition-all duration-500"
          animate={{ rotateY: flipped ? 180 : 0 }}
          transition={{ duration: 0.6, type: "spring", stiffness: 260, damping: 20 }}
          style={{ transformStyle: 'preserve-3d' }}
        >
          {/* Front */}
          <div className="absolute inset-0 backface-hidden rounded-xl border border-border bg-surface shadow-sm flex flex-col items-center justify-center p-6 text-center hover:border-primary/50 transition-colors">
            <div className="text-lg font-medium leading-relaxed">{cur.front}</div>
            {cur.hint && (
              <div className="mt-4 text-xs text-muted-foreground italic opacity-0 group-hover:opacity-100 transition-opacity">
                Hint: {cur.hint}
              </div>
            )}
          </div>

          {/* Back */}
          <div
            className="absolute inset-0 backface-hidden rounded-xl border border-primary/20 bg-primary/5 shadow-sm flex flex-col items-center justify-center p-6 text-center"
            style={{ transform: 'rotateY(180deg)' }}
          >
            <div className="text-lg font-medium leading-relaxed">{cur.back}</div>
          </div>
        </motion.div>
      </div>

      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          className="btn btn-outline btn-sm min-w-[100px]"
          onClick={() => {
            log({
              kind: 'flashcard',
              itemId: cur.id,
              correct: false,
              topic: cur.topic,
              skill: cur.skill,
              difficulty: cur.difficulty,
            });
            setFlipped(false);
            setIndex((i) => Math.min(i + 1, total - 1));
          }}
        >
          Need Review
        </button>
        <button
          className="btn btn-primary btn-sm min-w-[100px]"
          onClick={() => {
            log({
              kind: 'flashcard',
              itemId: cur.id,
              correct: true,
              topic: cur.topic,
              skill: cur.skill,
              difficulty: cur.difficulty,
            });
            setFlipped(false);
            setIndex((i) => Math.min(i + 1, total - 1));
          }}
        >
          Got it
        </button>
      </div>

      <div className="mt-4 flex justify-center">
        <button
          className="text-xs text-muted-foreground hover:text-primary transition-colors"
          title="Save card to your review deck"
          onClick={(e) => {
            e.stopPropagation();
            const payload = {
              cards: [
                {
                  front: cur.front,
                  back: cur.back,
                  hint: cur.hint,
                  topic: cur.topic,
                  skill: cur.skill,
                },
              ],
            };
            const msg = `Please call add_to_deck with the following:\n${JSON.stringify(payload)}`;
            send(msg).catch(() => void 0);
          }}
        >
          Save to deck
        </button>
      </div>
    </div>
  );
}

function QuestionnaireCard({
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
  const [activeIndex, setActiveIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const setUI = useChatStore((s) => s.setUI);
  const persistTutor = useChatStore((s) => s.persistTutorStateForMessage);
  const sendUserMessage = useChatStore((s) => s.sendUserMessage);
  const isSubmitted = questionnaire.status === 'submitted';

  const firstIncompleteIndex = useMemo(() => {
    for (let i = 0; i < questionnaire.questions.length; i += 1) {
      const q = questionnaire.questions[i];
      const existing = initialSelections[q.id];
      if (!existing || existing.length === 0) return i;
    }
    return 0;
  }, [questionnaire.questions, initialSelections]);

  useEffect(() => {
    // Reset selections if questionnaire updates (e.g., new follow-up)
    setSelections(initialSelections);
    setActiveIndex(firstIncompleteIndex);
  }, [initialSelections, firstIncompleteIndex]);

  const questionCount = questionnaire.questions.length;

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
  if (!questionCount) return null;
  const activeQuestion =
    questionnaire.questions[Math.min(activeIndex, Math.max(questionCount - 1, 0))];
  const activeSelected = selections[activeQuestion.id] ?? [];
  const isCurrentAnswered = activeSelected.length > 0;
  const allowMultiple = !!activeQuestion.allowMultiple;

  const goToIndex = (idx: number) => {
    if (!Number.isFinite(idx) || questionCount === 0) return;
    setActiveIndex((prev) => {
      if (idx < 0) return 0;
      if (idx >= questionCount) return questionCount - 1;
      if (prev === idx) return prev;
      return idx;
    });
  };

  const goPrevious = () => goToIndex(activeIndex - 1);
  const goNext = () => goToIndex(activeIndex + 1);

  const handleSubmit = async () => {
    if (!allAnswered || submitting) return;
    setSubmitting(true);
    const now = Date.now();
    try {
      const state = (useChatStore as any).getState();
      const prevMap = state.ui.tutorByMessageId || {};
      const prevEntry = prevMap[messageId] || {};
      const updatedQuestionnaire: TutorQuestionnaire = {
        ...questionnaire,
        status: 'submitted',
        submittedAt: now,
        responses: selections,
      };
      setUI({
        tutorByMessageId: {
          ...prevMap,
          [messageId]: {
            ...prevEntry,
            questionnaire: updatedQuestionnaire,
          },
        },
      });
      await persistTutor(messageId);

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
    <div className="rounded-xl border border-border/60 bg-surface/50 p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="rounded-full bg-primary/10 p-2">
          <QuestionMarkCircleIcon className="h-5 w-5 text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-tight">
            Tell me about your goals
          </span>
          <span className="text-xs text-muted-foreground">
            {isSubmitted
              ? 'Thanks! I will tailor the plan with this in mind.'
              : 'Choose the options that best fit you.'}
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-border/50 bg-muted/20 p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
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
              key={activeQuestion.id}
              variants={contentVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              className="space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  {activeQuestion.category && (
                    <span className="badge badge-sm mr-2 uppercase tracking-wide bg-primary/10 text-primary border-primary/20">
                      {activeQuestion.category}
                    </span>
                  )}
                  <div className="text-sm font-medium leading-relaxed mt-1">{activeQuestion.question}</div>
                </div>
                {allowMultiple && (
                  <span className="text-[10px] text-muted-foreground uppercase tracking-wide bg-muted px-1.5 py-0.5 rounded">
                    Multi-select
                  </span>
                )}
              </div>

              <div className="grid gap-2">
                {activeQuestion.options.map((option, idx) => {
                  const isSelected = activeSelected.includes(option.label);
                  return (
                    <button
                      key={safeKey(option.label, idx, activeQuestion.id)}
                      className={`btn justify-start h-auto py-2.5 px-3 transition-all duration-200 ${isSubmitted
                        ? isSelected
                          ? 'btn-primary opacity-90'
                          : 'btn-outline opacity-50'
                        : isSelected
                          ? 'btn-primary ring-2 ring-primary/20 ring-offset-1'
                          : 'btn-outline hover:bg-muted/50'
                        }`}
                      onClick={() => handleToggle(activeQuestion.id, option.label, allowMultiple)}
                      disabled={isSubmitted}
                    >
                      <div className="flex flex-col items-start text-left w-full">
                        <span className="font-medium text-sm">{option.label}</span>
                        {option.description && (
                          <span className="text-xs opacity-80 mt-0.5 font-normal">
                            {option.description}
                          </span>
                        )}
                      </div>
                      {isSelected && (
                        <CheckIcon className="h-4 w-4 ml-auto shrink-0" />
                      )}
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
          className="mt-4 flex items-center gap-2 text-xs text-muted-foreground bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 p-2 rounded-md border border-emerald-500/20"
        >
          <HandThumbUpIcon className="h-4 w-4" />
          <span>
            Responses submitted{submittedTimestamp ? ` · ${submittedTimestamp}` : ''}. Let me
            incorporate this into your learning journey!
          </span>
        </motion.div>
      ) : (
        <div className="mt-4 flex items-center justify-between pt-2">
          <span className="text-xs text-muted-foreground font-medium">
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

function PlanProposalCard({
  messageId,
  proposal,
  suggestions,
}: {
  messageId: string;
  proposal: TutorPlanProposal;
  suggestions?: TutorPlanSuggestion[] | null;
}) {
  const [approving, setApproving] = useState(false);
  const [declining, setDeclining] = useState(false);
  const setUI = useChatStore((s) => s.setUI);
  const persistTutor = useChatStore((s) => s.persistTutorStateForMessage);
  const updateChatSettings = useChatStore((s) => s.updateChatSettings);
  const sendUserMessage = useChatStore((s) => s.sendUserMessage);
  const chats = useChatStore((s) => s.chats);
  const selectedChatId = useChatStore((s) => s.selectedChatId);
  const chat = chats.find((c) => c.id === selectedChatId);

  const resolved = proposal.status === 'approved' || proposal.status === 'declined';
  const disableActions = resolved || approving || declining;
  const nodesCount = proposal.plan.nodes.length;
  const estimatedHours = proposal.plan.metadata?.estimatedHours;

  const applyProposalStatus = async (status: 'approved' | 'declined', extra?: Partial<TutorPlanProposal>) => {
    const state = (useChatStore as any).getState();
    const prevMap = state.ui.tutorByMessageId || {};
    const prevEntry = prevMap[messageId] || {};
    const nextProposal: TutorPlanProposal = {
      ...proposal,
      ...extra,
      status,
      resolvedAt: Date.now(),
    };
    setUI({
      tutorByMessageId: {
        ...prevMap,
        [messageId]: {
          ...prevEntry,
          planProposal: nextProposal,
        },
      },
    });
    await persistTutor(messageId);
  };

  const handleApprove = async () => {
    if (!chat) return;
    setApproving(true);
    try {
      const now = Date.now();
      let adoptedPlan = { ...proposal.plan, updatedAt: now };
      const hasInProgress = adoptedPlan.nodes.some((n) => n.status === 'in_progress');
      if (!hasInProgress && adoptedPlan.nodes.length > 0) {
        const firstReady = getNextNode(adoptedPlan) || adoptedPlan.nodes[0];
        adoptedPlan = updateNodeStatus(adoptedPlan, firstReady.id, 'in_progress');
      }
      await updateChatSettings({
        learningPlan: adoptedPlan,
        planGenerated: true,
        enableLearnerModel: true,
      });
      await applyProposalStatus('approved', { plan: adoptedPlan });

      const currentNode = getNextNode(adoptedPlan);
      const nextTopic = currentNode ? currentNode.name : 'our next topic';
      const content = `Plan approved. Let's get started with ${nextTopic}!`;
      await sendUserMessage(content, {
        metadata: {
          hiddenFromUser: true,
          kind: 'tutor_plan_adoption',
        },
      });
    } catch {
      // Surface failure via UI notice
      setUI({ notice: 'Failed to apply learning plan. Please try again.' });
    } finally {
      setApproving(false);
    }
  };

  const handleRequestChanges = async () => {
    if (declining || approving) return;
    const feedback = window.prompt(
      'What would you like to adjust? Share specifics so the tutor can update the plan.',
      'Could we add more practice for the fundamentals?',
    );
    if (feedback == null || !feedback.trim()) return;
    setDeclining(true);
    try {
      await applyProposalStatus('declined');
      await sendUserMessage(
        `Plan feedback:\n${feedback.trim()}\nPlease update the plan and confirm the changes.`,
      );
    } finally {
      setDeclining(false);
    }
  };

  const confirmationNeeded = proposal.requiresConfirmation !== false;
  const resolvedLabel =
    proposal.status === 'approved'
      ? 'Plan adopted'
      : proposal.status === 'declined'
        ? 'Awaiting revisions'
        : null;

  return (
    <div className="rounded-xl border border-border/60 bg-surface/50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-accent/10 p-2">
          <ClipboardDocumentCheckIcon className="h-5 w-5 text-accent" />
        </div>
        <div className="flex-1">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold leading-tight">Personalized learning plan ready</span>
            <span className="text-xs text-muted-foreground">
              {nodesCount} topics{estimatedHours ? ` · ~${estimatedHours}h commitment` : ''}
            </span>
          </div>
          <div className="mt-3 space-y-3 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">{proposal.plan.goal}</div>
            {confirmationNeeded && !resolved && proposal.confirmationMessage && (
              <div className="rounded-md border border-border/80 bg-muted/20 p-3 text-xs leading-relaxed">
                {proposal.confirmationMessage}
              </div>
            )}
          </div>
          {suggestions && suggestions.length > 0 && (
            <div className="mt-4">
              <PlanSuggestionsCard suggestions={suggestions} compact />
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              className="btn btn-outline btn-sm"
              onClick={() =>
                setUI({ planSheetOpen: true, planSheetPlanOverride: proposal.plan })
              }
            >
              View full plan
            </button>
            <button
              className="btn btn-primary btn-sm"
              onClick={handleApprove}
              disabled={disableActions}
            >
              {approving ? 'Applying…' : 'Approve plan'}
            </button>
            <button
              className="btn btn-outline btn-sm"
              onClick={handleRequestChanges}
              disabled={disableActions}
            >
              {declining ? 'Recording…' : 'Suggest changes'}
            </button>
            {resolvedLabel && (
              <span className="badge badge-outline uppercase tracking-wide text-[11px] ml-auto">
                {resolvedLabel}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PlanSuggestionsCard({
  suggestions,
  compact = false,
}: {
  suggestions: TutorPlanSuggestion[];
  compact?: boolean;
}) {
  if (!suggestions.length) return null;
  return (
    <div
      className={`rounded-lg border border-dashed border-border/80 bg-muted/10 ${compact ? 'p-3' : 'p-4'
        }`}
    >
      <div className="flex items-center gap-2 mb-3">
        <ArrowPathIcon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Plan recommendations</span>
      </div>
      <div className="space-y-3 text-xs text-muted-foreground">
        {suggestions.map((s, idx) => (
          <div key={safeKey(`${s.action}-${idx}`, idx, 'suggestion')} className="leading-snug p-2 rounded bg-surface/50 border border-border/30">
            <div className="font-medium text-foreground flex items-center gap-2">
              {s.action}
              {s.priority && (
                <span className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${s.priority === 'high' ? 'bg-rose-500/10 text-rose-500' : 'bg-muted text-muted-foreground'
                  }`}>
                  {s.priority}
                </span>
              )}
            </div>
            {s.description && <div className="mt-1">{s.description}</div>}
            {s.rationale && (
              <div className="italic text-muted-foreground/80 mt-1">Rationale: {s.rationale}</div>
            )}
            {s.estimatedImpact && <div className="mt-1 text-accent">Impact: {s.estimatedImpact}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function DiagnosticCard({
  messageId,
  diagnostic,
}: {
  messageId: string;
  diagnostic: TutorDiagnostic;
}) {
  const setUI = useChatStore((s) => s.setUI);
  const persistTutor = useChatStore((s) => s.persistTutorStateForMessage);
  const sendUserMessage = useChatStore((s) => s.sendUserMessage);
  const tutorMap = useChatStore((s) => s.ui.tutorByMessageId || {});
  const attempts = (tutorMap[messageId]?.attempts as any) || {};
  const mcqAttempts = (attempts.mcq as Record<string, { done?: boolean; correct?: boolean }>) || {};

  const total = diagnostic.items.length;
  const answered = diagnostic.items.filter((item) => mcqAttempts[item.id]?.done).length;
  const correct = diagnostic.items.filter((item) => mcqAttempts[item.id]?.correct).length;
  const percentComplete = total > 0 ? Math.round((answered / total) * 100) : 0;
  const scoreRatio =
    diagnostic.status === 'completed' && typeof diagnostic.score === 'number'
      ? diagnostic.score
      : total > 0
        ? correct / total
        : 0;
  const scorePercent = Math.round(scoreRatio * 100);

  useEffect(() => {
    if (total === 0 || answered !== total) return;
    const state = (useChatStore as any).getState();
    const prevMap = state.ui.tutorByMessageId || {};
    const prevEntry = prevMap[messageId] || {};
    const prevDiagnosticMeta = (prevEntry as any).diagnosticMeta || {};
    const prevCompletion =
      (prevDiagnosticMeta.completedAt as Record<string, number>) || {};
    const alreadyRecorded = !!prevCompletion[diagnostic.diagnosticId];
    const now = Date.now();

    const needsStatusUpdate =
      diagnostic.status !== 'completed' || typeof diagnostic.score !== 'number';
    if (needsStatusUpdate || !alreadyRecorded) {
      const updatedDiagnostic: TutorDiagnostic = needsStatusUpdate
        ? { ...diagnostic, status: 'completed', score: scoreRatio }
        : diagnostic;
      setUI({
        tutorByMessageId: {
          ...prevMap,
          [messageId]: {
            ...prevEntry,
            diagnostic: updatedDiagnostic,
            diagnosticMeta: {
              ...prevDiagnosticMeta,
              completedAt: {
                ...prevCompletion,
                [diagnostic.diagnosticId]: now,
              },
            },
          },
        },
      });
      persistTutor(messageId).catch(() => void 0);
    }

    if (!alreadyRecorded) {
      const topicText = diagnostic.topic ? ` on ${diagnostic.topic}` : '';
      const message = `Completed diagnostic${topicText} (${scorePercent}%).`;
      sendUserMessage(message, {
        metadata: {
          hiddenFromUser: true,
          kind: 'tutor_diagnostic_completion',
        },
      }).catch(() => void 0);
    }
  }, [
    answered,
    total,
    diagnostic,
    messageId,
    scoreRatio,
    scorePercent,
    setUI,
    persistTutor,
    sendUserMessage,
  ]);

  const mcqItems: TutorMCQItem[] = useMemo(
    () =>
      diagnostic.items.map((item) => ({
        id: item.id,
        question: item.question,
        choices: item.choices,
        correct: typeof item.correct === 'number' ? item.correct : -1,
        explanation: item.explanation,
        topic: item.skill,
        skill: item.skill,
        difficulty:
          item.difficulty === 'beginner'
            ? 'easy'
            : item.difficulty === 'advanced'
              ? 'hard'
              : item.difficulty === 'intermediate'
                ? 'medium'
                : (item.difficulty as any),
      })),
    [diagnostic.items],
  );

  const interpretation = useMemo(() => {
    if (!diagnostic.interpretation || !total || answered !== total) return null;
    const entries = Object.entries(diagnostic.interpretation);
    for (const [range, text] of entries) {
      const match = range.match(/(\d+)\s*-\s*(\d+)%?/);
      if (!match) continue;
      const low = Number.parseInt(match[1], 10);
      const high = Number.parseInt(match[2], 10);
      if (Number.isNaN(low) || Number.isNaN(high)) continue;
      if (scorePercent >= low && scorePercent <= high) return text;
    }
    return null;
  }, [diagnostic.interpretation, answered, total, scorePercent]);

  return (
    <div className="rounded-xl border border-border/60 bg-surface/50 p-4 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="rounded-full bg-accent/10 p-2">
          <ChartBarIcon className="h-5 w-5 text-accent" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-tight">
            Diagnostic · {diagnostic.topic}
          </span>
          <span className="text-xs text-muted-foreground">
            {diagnostic.depth === 'comprehensive'
              ? 'Comprehensive check'
              : diagnostic.depth === 'moderate'
                ? 'Moderate check'
                : 'Quick check'}
            {' · '}
            {answered}/{total} answered
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 mb-4">
        <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full bg-primary/60"
            initial={{ width: 0 }}
            animate={{ width: `${percentComplete}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
        <span className="text-xs text-muted-foreground font-medium w-8 text-right">{percentComplete}%</span>
      </div>

      <div className="mt-4">
        <MCQList messageId={messageId} items={mcqItems} />
      </div>

      {answered === total && total > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-lg border border-border/60 bg-muted/20 p-4 text-xs text-muted-foreground"
        >
          <div className="font-bold text-foreground text-sm mb-1">Score: {scorePercent}%</div>
          {interpretation && <div className="leading-relaxed">{interpretation}</div>}
        </motion.div>
      )}
    </div>
  );
}

function LearnerUpdatesCard({ updates }: { updates: TutorLearnerModelUpdate[] }) {
  const plan = useChatStore((s) => {
    const chat = s.chats.find((c) => c.id === s.selectedChatId);
    return chat?.settings?.learningPlan ?? null;
  });
  const setUI = useChatStore((s) => s.setUI);

  const resolveNodeName = (nodeId: string) =>
    plan?.nodes.find((n) => n.id === nodeId)?.name ?? nodeId;

  return (
    <div className="rounded-md border border-border bg-surface/50 p-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <SparklesIcon className="w-3.5 h-3.5 text-accent" />
          Learner Model Updated
        </div>
        <button
          className="text-xs text-accent hover:underline font-medium"
          onClick={() => setUI({ planSheetOpen: true })}
        >
          View Learning Hub
        </button>
      </div>
      <div className="mt-2 space-y-2">
        {updates.map((update, idx) => {
          const before = update.confidenceBefore ?? null;
          const after = update.confidenceAfter ?? null;
          const delta =
            before != null && after != null ? Math.round((after - before) * 100) : null;

          return (
            <div
              key={safeKey(update.nodeId, idx, 'lm')}
              className="text-sm flex items-center justify-between"
            >
              <span className="font-medium">{resolveNodeName(update.nodeId)}</span>
              <span className="text-muted-foreground text-xs">
                {delta != null && delta !== 0 ? (
                  <span className={delta > 0 ? 'text-green-500' : 'text-amber-500'}>
                    {delta > 0 ? '+' : ''}{delta}% confidence
                  </span>
                ) : 'Updated'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
