'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
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
  if (!s || s === 'null' || s === 'undefined') return `${prefix}_${idx}`;
  return s;
}

type StepStatus = 'pending' | 'correct' | 'incorrect' | 'answered';

function usePrefersReducedMotion() {
  const [prefers, setPrefers] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = () => setPrefers(media.matches);
    handleChange();
    try {
      media.addEventListener('change', handleChange);
      return () => media.removeEventListener('change', handleChange);
    } catch {
      media.addListener(handleChange);
      return () => media.removeListener(handleChange);
    }
  }, []);

  return prefers;
}

function AnimatedStep({
  stepKey,
  className,
  children,
}: {
  stepKey: string | number;
  className?: string;
  children: ReactNode;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const [phase, setPhase] = useState<'enter' | 'entered'>('entered');

  useEffect(() => {
    if (reduceMotion) return;
    setPhase('enter');
    const raf = window.requestAnimationFrame(() => setPhase('entered'));
    return () => window.cancelAnimationFrame(raf);
  }, [stepKey, reduceMotion]);

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  const animationClass =
    phase === 'entered'
      ? 'transition-all duration-450 ease-[cubic-bezier(0.16,0.84,0.44,1)] opacity-100 translate-y-0'
      : 'transition-all duration-450 ease-[cubic-bezier(0.16,0.84,0.44,1)] opacity-0 translate-y-3';
  const merged = className ? `${className} ${animationClass}` : animationClass;

  return <div className={merged}>{children}</div>;
}

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
    <div className="flex items-center gap-1">
      {items.map((item, idx) => {
        const status = resolveStatus(item, idx);
        const color =
          status === 'correct'
            ? 'bg-emerald-500 border-emerald-500'
            : status === 'incorrect'
              ? 'bg-destructive/70 border-destructive/60'
              : status === 'answered'
                ? 'bg-primary/40 border-primary/50'
                : 'bg-muted border-border';
        const ring = idx === activeIndex ? 'ring-2 ring-primary/60 ring-offset-1' : '';
        const statusLabel =
          status === 'correct'
            ? 'answered correctly'
            : status === 'incorrect'
              ? 'answered incorrectly'
              : status === 'answered'
                ? 'answered'
                : 'not answered yet';
        return (
          <button
            type="button"
            key={idx}
            className={`h-2.5 w-2.5 rounded-full border transition-all duration-150 ${color} ${ring}`}
            onClick={() => onSelect(idx)}
            aria-label={`Go to item ${idx + 1} (${statusLabel})`}
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
    <div className="px-4 pt-3">
      <div className="rounded-lg border border-border bg-muted/40">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border justify-between">
          <div className="flex items-center gap-2 min-w-0">
            <AcademicCapIcon className="h-4 w-4" />
            <div className="text-sm font-medium truncate">{title || 'Tutor Tools'}</div>
          </div>
        </div>
        <div className="p-3 space-y-4">
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
            <div className="rounded-md border border-border bg-surface p-3">
              <div className="text-sm font-medium mb-2">Grading</div>
              <div className="space-y-2 text-sm">
                {Object.entries(grading).map(([id, g], idx) => (
                  <div key={safeKey(id, idx, 'grade')}>
                    <div className="font-medium">
                      Item {id}
                      {g.score != null ? ` · Score: ${Math.round(g.score * 100)}%` : ''}
                    </div>
                    <div className="text-muted-foreground whitespace-pre-wrap">{g.feedback}</div>
                    {Array.isArray(g.criteria) && g.criteria.length > 0 && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        Criteria: {g.criteria.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MCQList({ items, messageId }: { items: TutorMCQItem[]; messageId: string }) {
  const log = useChatStore((s) => s.logTutorResult);
  const setUI = useChatStore((s) => s.setUI);
  const persistTutor = useChatStore((s) => s.persistTutorStateForMessage);
  const tutorMap = useChatStore((s) => s.ui.tutorByMessageId || {});
  const attempts = (tutorMap[messageId]?.attempts as any) || {};
  const mcq =
    (attempts.mcq as Record<string, { choice?: number; done?: boolean; correct?: boolean }>) || {};
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
  const transitionTimer = useRef<number | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [pendingIndex, setPendingIndex] = useState<number | null>(null);
  const [transitionStage, setTransitionStage] = useState<'idle' | 'out' | 'in'>('idle');

  useEffect(
    () => () => {
      if (advanceTimer.current != null) {
        window.clearTimeout(advanceTimer.current);
        advanceTimer.current = null;
      }
      if (transitionTimer.current != null) {
        window.clearTimeout(transitionTimer.current);
        transitionTimer.current = null;
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

  const activeAttempt = mcq[activeItem.id] || {};
  const picked = activeAttempt.choice;
  const answered = !!activeAttempt.done;
  const correctIdx = typeof activeItem.correct === 'number' ? activeItem.correct : -1;

  const clampIndex = useCallback(
    (idx: number) => {
      if (!total) return 0;
      if (Number.isNaN(idx)) return 0;
      if (idx < 0) return 0;
      if (idx >= total) return total - 1;
      return idx;
    },
    [total],
  );

  const setIndexClamped = useCallback(
    (idx: number) => {
      const target = clampIndex(idx);
      setActiveIndex(target);
    },
    [clampIndex],
  );

  const requestAnimatedIndex = useCallback(
    (idx: number) => {
      const target = clampIndex(idx);
      if (!total || target === activeIndex) return;
      if (prefersReducedMotion) {
        setIndexClamped(target);
        return;
      }
      if (transitionStage !== 'idle') return;
      setPendingIndex(target);
      setTransitionStage('out');
    },
    [activeIndex, clampIndex, prefersReducedMotion, setIndexClamped, total, transitionStage],
  );

  const goToIndex = useCallback(
    (idx: number, opts?: { animate?: boolean }) => {
      if (opts?.animate) {
        requestAnimatedIndex(idx);
        return;
      }
      if (transitionTimer.current != null) {
        window.clearTimeout(transitionTimer.current);
        transitionTimer.current = null;
      }
      setPendingIndex(null);
      setTransitionStage('idle');
      setIndexClamped(idx);
    },
    [requestAnimatedIndex, setIndexClamped],
  );

  const goPrevious = useCallback(
    () => goToIndex(activeIndex - 1, { animate: true }),
    [activeIndex, goToIndex],
  );
  const goNext = useCallback(
    () => goToIndex(activeIndex + 1, { animate: true }),
    [activeIndex, goToIndex],
  );

  useEffect(() => {
    if (prefersReducedMotion && transitionStage !== 'idle') {
      if (pendingIndex != null) {
        setIndexClamped(pendingIndex);
      }
      if (transitionTimer.current != null) {
        window.clearTimeout(transitionTimer.current);
        transitionTimer.current = null;
      }
      setPendingIndex(null);
      setTransitionStage('idle');
    }
  }, [prefersReducedMotion, pendingIndex, setIndexClamped, transitionStage]);

  useEffect(() => {
    if (prefersReducedMotion) return undefined;
    if (transitionStage === 'out') {
      if (transitionTimer.current != null) {
        window.clearTimeout(transitionTimer.current);
        transitionTimer.current = null;
      }
      transitionTimer.current = window.setTimeout(() => {
        if (pendingIndex != null) {
          setIndexClamped(pendingIndex);
        }
        transitionTimer.current = null;
        setTransitionStage('in');
      }, 220);
      return () => {
        if (transitionTimer.current != null) {
          window.clearTimeout(transitionTimer.current);
          transitionTimer.current = null;
        }
      };
    }
    if (transitionStage === 'in') {
      if (transitionTimer.current != null) {
        window.clearTimeout(transitionTimer.current);
        transitionTimer.current = null;
      }
      transitionTimer.current = window.setTimeout(() => {
        setTransitionStage('idle');
        setPendingIndex(null);
        transitionTimer.current = null;
      }, 320);
      return () => {
        if (transitionTimer.current != null) {
          window.clearTimeout(transitionTimer.current);
          transitionTimer.current = null;
        }
      };
    }
    return undefined;
  }, [transitionStage, pendingIndex, setIndexClamped, prefersReducedMotion]);

  const handleSelect = (choiceIdx: number) => {
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
      const delay = prefersReducedMotion ? 220 : 650;
      advanceTimer.current = window.setTimeout(() => {
        goToIndex(activeIndex + 1, { animate: true });
        advanceTimer.current = null;
      }, delay);
    }
  };

  const cardTransitionClass = prefersReducedMotion
    ? ''
    : transitionStage === 'out'
      ? 'opacity-0 translate-y-4 scale-[0.97]'
      : 'opacity-100 translate-y-0 scale-100';
  const transitionBase = prefersReducedMotion
    ? ''
    : 'transition-all duration-400 ease-[cubic-bezier(0.19,1,0.22,1)] will-change-transform will-change-opacity';
  const cardClassName = [
    'rounded-md border border-border bg-surface p-3',
    transitionBase,
    cardTransitionClass,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className="space-y-3">
      <div className={cardClassName}>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Question {activeIndex + 1} / {total}
          </span>
          <StepperDots
            items={items}
            activeIndex={activeIndex}
            resolveStatus={(item) => {
              const attempt = mcq[item.id];
              if (!attempt?.done) return 'pending';
              return attempt.correct ? 'correct' : 'incorrect';
            }}
            onSelect={(idx) => goToIndex(idx, { animate: true })}
          />
        </div>

        <AnimatedStep
          stepKey={activeItem.id}
          className="mt-4 rounded-md border border-border bg-muted/20"
        >
          <div className="px-3 py-2 text-sm font-medium">
            {activeIndex + 1}. {activeItem.question}
          </div>
          <div className="px-3 pb-3 pt-1 grid gap-2">
            {activeItem.choices.map((choice, idx) => {
              const isPicked = picked === idx;
              const isCorrect = correctIdx === idx;
              const intent = answered
                ? isCorrect
                  ? 'btn-primary answer-pop'
                  : isPicked
                    ? 'btn-destructive answer-pop'
                    : 'btn-outline'
                : isPicked
                  ? 'btn'
                  : 'btn-outline';
              return (
                <button
                  type="button"
                  key={idx}
                  className={`btn ${intent} justify-start`}
                  onClick={() => handleSelect(idx)}
                  disabled={answered}
                >
                  <span className="min-w-5 text-xs font-semibold">
                    {String.fromCharCode(65 + idx)}
                  </span>
                  <span className="ml-2">{choice}</span>
                </button>
              );
            })}
            {answered && typeof picked === 'number' && (
              <span className="badge inline-flex items-center gap-1 w-fit">
                {picked === correctIdx ? (
                  <>
                    <CheckIcon className="h-3.5 w-3.5" /> Correct
                  </>
                ) : (
                  <>
                    <XMarkIcon className="h-3.5 w-3.5" /> Incorrect
                  </>
                )}
              </span>
            )}
            {answered && activeItem.explanation && (
              <div className="text-xs text-muted-foreground">{activeItem.explanation}</div>
            )}
          </div>
        </AnimatedStep>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={goPrevious}
            disabled={activeIndex === 0}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={goNext}
            disabled={activeIndex >= total - 1}
          >
            Next
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
  const attempts = (tutorMap[messageId]?.attempts as any) || {};
  const fb =
    (attempts.fillBlank as Record<
      string,
      { answer?: string; revealed?: boolean; correct?: boolean }
    >) || {};
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
      }, 350);
    }
  };

  return (
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-surface p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Question {activeIndex + 1} / {total}
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

        <AnimatedStep
          stepKey={activeItem.id}
          className="mt-4 rounded-md border border-border bg-muted/20 p-3"
        >
          <div className="text-sm font-medium mb-3">
            {activeIndex + 1}. {activeItem.prompt}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              className="input flex-1"
              placeholder="Type your answer"
              value={value}
              onChange={(event) => persistAnswer(event.currentTarget.value)}
              disabled={revealed}
            />
            <button
              type="button"
              className="btn btn-outline"
              onClick={revealAnswer}
              disabled={revealed || !String(value || '').trim()}
            >
              Check
            </button>
            {revealed && (
              <span className="badge inline-flex items-center gap-1">
                {correct ? <CheckIcon className="h-3.5 w-3.5" /> : <XMarkIcon className="h-3.5 w-3.5" />}
                {correct ? 'Correct' : 'Try again'}
              </span>
            )}
          </div>
          {revealed && !correct && (
            <div className="mt-2 text-xs text-muted-foreground">Answer: {activeItem.answer}</div>
          )}
          {revealed && activeItem.explanation && (
            <div className="mt-1 text-xs text-muted-foreground">{activeItem.explanation}</div>
          )}
        </AnimatedStep>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={goPrevious}
            disabled={activeIndex === 0}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={goNext}
            disabled={activeIndex >= total - 1}
          >
            Next
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
  const attempts = (tutorMap[messageId]?.attempts as any) || {};
  const open = (attempts.open as Record<string, { answer?: string }>) || {};
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
    <div className="space-y-3">
      <div className="rounded-md border border-border bg-surface p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Question {activeIndex + 1} / {total}
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

        <AnimatedStep
          stepKey={activeItem.id}
          className="mt-4 rounded-md border border-border bg-muted/20 p-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="text-sm font-medium leading-snug">
              {activeIndex + 1}. {activeItem.prompt}
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm shrink-0"
              onClick={() =>
                setRevealed((state) => ({ ...state, [activeItem.id]: !state[activeItem.id] }))
              }
            >
              <EyeIcon className="h-4 w-4" />
              <span className="ml-1">{isSampleVisible ? 'Hide' : 'Show'} sample</span>
            </button>
          </div>
          {isSampleVisible && (
            <div className="mt-2 text-sm">
              {activeItem.sample_answer ? (
                <div>
                  <div className="font-medium mb-1">Sample answer</div>
                  <div className="text-muted-foreground whitespace-pre-wrap">
                    {activeItem.sample_answer}
                  </div>
                </div>
              ) : activeItem.rubric ? (
                <div>
                  <div className="font-medium mb-1">Rubric</div>
                  <div className="text-muted-foreground whitespace-pre-wrap">{activeItem.rubric}</div>
                </div>
              ) : null}
            </div>
          )}
          <div className="mt-3 flex flex-col gap-3">
            <textarea
              className="textarea flex-1 text-sm"
              rows={4}
              placeholder="Type your response"
              value={answer}
              onChange={(event) => persistAnswer(event.currentTarget.value)}
            />
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn btn-outline" onClick={requestFeedback}>
                Get feedback
              </button>
              {gradingEntry && (
                <span className="text-xs text-muted-foreground">
                  Last graded {gradingEntry.score != null
                    ? `· ${Math.round((gradingEntry.score || 0) * 100)}%`
                    : ''}
                </span>
              )}
            </div>
          </div>
          {gradingEntry && (
            <div className="mt-3 text-sm">
              <div className="font-medium">
                Feedback{' '}
                {gradingEntry.score != null
                  ? `(score: ${Math.round((gradingEntry.score || 0) * 100)}%)`
                  : ''}
              </div>
              <div className="text-muted-foreground whitespace-pre-wrap">
                {gradingEntry.feedback}
              </div>
              {Array.isArray(gradingEntry.criteria) && gradingEntry.criteria!.length > 0 && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Criteria: {gradingEntry.criteria!.join(', ')}
                </div>
              )}
            </div>
          )}
        </AnimatedStep>

        <div className="mt-4 flex items-center justify-between">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={goPrevious}
            disabled={activeIndex === 0}
          >
            Previous
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={goNext}
            disabled={activeIndex >= total - 1}
          >
            Next
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
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="text-xs text-muted-foreground mb-2">
        Card {index + 1} / {total}
      </div>
      <div
        className={`flashcard ${flipped ? 'is-flipped' : ''}`}
        onClick={() => setFlipped((x) => !x)}
      >
        <div className="flashcard-inner">
          <div className="flashcard-face flashcard-front">
            <div className="rounded-md border border-border p-4 bg-muted/30 min-h-24 whitespace-pre-wrap">
              {cur.front}
            </div>
          </div>
          <div className="flashcard-face flashcard-back">
            <div className="rounded-md border border-border p-4 bg-muted/30 min-h-24 whitespace-pre-wrap">
              {cur.back}
            </div>
          </div>
        </div>
      </div>
      {cur.hint && !flipped && (
        <div className="mt-2 text-xs text-muted-foreground">Hint: {cur.hint}</div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button className="btn btn-outline" onClick={() => setFlipped((x) => !x)}>
          Flip
        </button>
        <button
          className="btn"
          onClick={() => {
            setFlipped(false);
            setIndex((i) => Math.min(i + 1, total - 1));
          }}
          disabled={index >= total - 1}
        >
          Next
        </button>
        <button
          className="btn btn-outline"
          onClick={() =>
            log({
              kind: 'flashcard',
              itemId: cur.id,
              correct: true,
              topic: cur.topic,
              skill: cur.skill,
              difficulty: cur.difficulty,
            })
          }
        >
          I knew it
        </button>
        <button
          className="btn btn-outline"
          onClick={() =>
            log({
              kind: 'flashcard',
              itemId: cur.id,
              correct: false,
              topic: cur.topic,
              skill: cur.skill,
              difficulty: cur.difficulty,
            })
          }
        >
          Need review
        </button>
        <button
          className="btn btn-outline"
          title="Save card to your review deck"
          onClick={() => {
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
      }, 220);
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
      // No-op; UI will remain consistent from state updates above
    } finally {
      setSubmitting(false);
    }
  };

  const submittedTimestamp =
    isSubmitted && questionnaire.submittedAt
      ? new Date(questionnaire.submittedAt).toLocaleTimeString()
      : null;

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-center gap-3 mb-3">
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

      <div className="rounded-md border border-border/60 bg-muted/10 p-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
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

        <AnimatedStep
          stepKey={activeQuestion.id}
          className="mt-3 rounded-md border border-border bg-muted/30 p-3"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              {activeQuestion.category && (
                <span className="badge badge-sm mr-2 uppercase tracking-wide">
                  {activeQuestion.category}
                </span>
              )}
              <div className="text-sm font-medium leading-snug">{activeQuestion.question}</div>
            </div>
            {allowMultiple && (
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Multi-select
              </span>
            )}
          </div>
          <div className="mt-3 grid gap-2">
            {activeQuestion.options.map((option, idx) => {
              const isSelected = activeSelected.includes(option.label);
              return (
                <button
                  key={safeKey(option.label, idx, activeQuestion.id)}
                  className={`btn justify-start ${
                    isSubmitted
                      ? isSelected
                        ? 'btn-primary'
                        : 'btn-outline'
                      : isSelected
                        ? 'btn'
                        : 'btn-outline'
                  }`}
                  onClick={() => handleToggle(activeQuestion.id, option.label, allowMultiple)}
                  disabled={isSubmitted}
                >
                  <span className="font-medium">{option.label}</span>
                  {option.description && (
                    <span className="ml-2 text-xs text-muted-foreground text-left">
                      {option.description}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </AnimatedStep>
      </div>

      {isSubmitted ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
          <HandThumbUpIcon className="h-4 w-4" />
          <span>
            Responses submitted{submittedTimestamp ? ` · ${submittedTimestamp}` : ''}. Let me
            incorporate this into your learning journey!
          </span>
        </div>
      ) : (
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {answeredCount}/{questionCount} answered
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-outline"
              onClick={goPrevious}
              disabled={activeIndex === 0}
            >
              Previous
            </button>
            {activeIndex === questionCount - 1 ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmit}
                disabled={!allAnswered || submitting}
              >
                {submitting ? 'Submitting…' : 'Submit answers'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-outline"
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
    <div className="rounded-md border border-border bg-surface p-4">
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
          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
            <div className="font-medium text-foreground">{proposal.plan.goal}</div>
            {confirmationNeeded && !resolved && proposal.confirmationMessage && (
              <div className="rounded-md border border-border/80 bg-muted/20 p-2 text-xs">
                {proposal.confirmationMessage}
              </div>
            )}
          </div>
          {suggestions && suggestions.length > 0 && (
            <div className="mt-3">
              <PlanSuggestionsCard suggestions={suggestions} compact />
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
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
              <span className="badge badge-outline uppercase tracking-wide text-[11px]">
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
      className={`rounded-md border border-dashed border-border/80 bg-muted/10 ${
        compact ? 'p-3' : 'p-4'
      }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <ArrowPathIcon className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Plan recommendations</span>
      </div>
      <div className="space-y-2 text-xs text-muted-foreground">
        {suggestions.map((s, idx) => (
          <div key={safeKey(`${s.action}-${idx}`, idx, 'suggestion')} className="leading-snug">
            <div className="font-medium text-foreground">
              {s.action}
              {s.priority && (
                <span className="ml-1 uppercase tracking-wide text-[10px] text-muted-foreground">
                  · {s.priority}
                </span>
              )}
            </div>
            {s.description && <div>{s.description}</div>}
            {s.rationale && (
              <div className="italic text-muted-foreground/80">Rationale: {s.rationale}</div>
            )}
            {s.estimatedImpact && <div>Impact: {s.estimatedImpact}</div>}
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
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="flex items-center gap-3 mb-3">
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
        <div className="h-2 flex-1 rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-accent"
            style={{ width: `${percentComplete}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground">{percentComplete}%</span>
      </div>
      <MCQList messageId={messageId} items={mcqItems} />
      {answered === total && total > 0 && (
        <div className="mt-4 rounded-md border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
          <div className="font-medium text-foreground">Score: {scorePercent}%</div>
          {interpretation && <div className="mt-1">{interpretation}</div>}
        </div>
      )}
    </div>
  );
}

function LearnerUpdatesCard({ updates }: { updates: TutorLearnerModelUpdate[] }) {
  const plan = useChatStore((s) => {
    const chat = s.chats.find((c) => c.id === s.selectedChatId);
    return chat?.settings?.learningPlan ?? null;
  });

  const resolveNodeName = (nodeId: string) =>
    plan?.nodes.find((n) => n.id === nodeId)?.name ?? nodeId;

  return (
    <div className="rounded-md border border-border bg-surface p-4">
      <div className="text-sm font-semibold mb-3">Learner model updates</div>
      <div className="space-y-3 text-xs text-muted-foreground">
        {updates.map((update, idx) => {
          const before = update.confidenceBefore ?? null;
          const after = update.confidenceAfter ?? null;
          const delta =
            before != null && after != null ? Math.round((after - before) * 100) : null;
          return (
            <div
              key={safeKey(update.nodeId, idx, 'lm')}
              className="rounded-md border border-border/70 bg-muted/20 p-3"
            >
              <div className="flex items-center justify-between text-foreground text-sm font-medium">
                <span>{resolveNodeName(update.nodeId)}</span>
                <span>
                  {before != null ? `${Math.round(before * 100)}%` : '—'} →{' '}
                  {after != null ? `${Math.round(after * 100)}%` : '—'}{' '}
                  {delta != null && (
                    <span className={delta >= 0 ? 'text-emerald-500' : 'text-red-500'}>
                      ({delta >= 0 ? '+' : ''}
                      {delta}%)
                    </span>
                  )}
                </span>
              </div>
              {update.tutorComment && (
                <div className="mt-2 text-xs text-muted-foreground/90">
                  {update.tutorComment}
                </div>
              )}
              {Array.isArray(update.evidence) && update.evidence.length > 0 && (
                <div className="mt-2 space-y-1">
                  {update.evidence.map((ev, evIdx) => (
                    <div key={safeKey(ev.question, evIdx, 'evidence')}>
                      <span className="font-medium text-foreground/80">{ev.question}</span>
                      {ev.result && (
                        <span className="ml-2 uppercase tracking-wide text-[10px]">
                          · {String(ev.result).toUpperCase()}
                        </span>
                      )}
                      {ev.feedback && (
                        <div className="text-muted-foreground">{ev.feedback}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
