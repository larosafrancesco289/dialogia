'use client';
import { useEffect, useMemo, useState } from 'react';
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
import { getNextNode, updateNodeStatus } from '@/lib/agent/planGenerator';

function safeKey(val: any, idx: number, prefix = 'item'): string {
  const s = typeof val === 'string' ? val.trim() : '';
  if (!s || s === 'null' || s === 'undefined') return `${prefix}_${idx}`;
  return s;
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
  // No longer mutates visible assistant content; results are kept in tutor state only
  const tutorMap = useChatStore((s) => s.ui.tutorByMessageId || {});
  const attempts = (tutorMap[messageId]?.attempts as any) || {};
  const mcq = (attempts.mcq as Record<string, { choice?: number; done?: boolean }>) || {};
  return (
    <div className="space-y-3">
      {items.map((q, idx) => {
        const picked = mcq[q.id]?.choice;
        const correctIdx = typeof q.correct === 'number' ? q.correct : -1;
        const answered = !!mcq[q.id]?.done;
        return (
          <div
            key={safeKey(q.id, idx, 'mcq')}
            className="rounded-md border border-border bg-surface"
          >
            <div className="px-3 py-2 text-sm font-medium">
              {idx + 1}. {q.question}
            </div>
            <div className="px-3 pb-2 grid gap-2">
              {q.choices.map((c, i) => {
                const isPicked = picked === i;
                const isCorrect = correctIdx === i;
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
                    key={i}
                    className={`btn ${intent} justify-start`}
                    onClick={() => {
                      if (answered) return;
                      const correct = i === correctIdx;
                      log({
                        kind: 'mcq',
                        itemId: q.id,
                        correct,
                        topic: q.topic,
                        skill: q.skill,
                        difficulty: q.difficulty,
                      });
                      // Persist attempt in UI store
                      const st = (useChatStore as any).getState();
                      const prev = (st.ui.tutorByMessageId || {})[messageId] || {};
                      const prevAttempts = (prev as any).attempts || {};
                      const prevMcq = (prevAttempts.mcq || {}) as Record<string, any>;
                      setUI({
                        tutorByMessageId: {
                          ...(st.ui.tutorByMessageId || {}),
                          [messageId]: {
                            ...prev,
                            attempts: {
                              ...prevAttempts,
                              mcq: { ...prevMcq, [q.id]: { choice: i, done: true, correct } },
                            },
                          },
                        },
                      });
                      // Persist to message for durability across reloads
                      persistTutor(messageId).catch(() => void 0);
                      // Append a compact quiz_result block into the same assistant message content
                      // Intentionally avoid appending raw quiz_result blocks to message content
                      // Model memory is handled via sanitized recap preambles.
                      try {
                        // no-op: legacy content mutation removed
                      } catch {}
                    }}
                    disabled={answered}
                  >
                    <span className="min-w-5 text-xs font-semibold">
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="ml-2">{c}</span>
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
              {answered && q.explanation && (
                <div className="text-xs text-muted-foreground">{q.explanation}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FillBlankList({ items, messageId }: { items: TutorFillBlankItem[]; messageId: string }) {
  const log = useChatStore((s) => s.logTutorResult);
  const setUI = useChatStore((s) => s.setUI);
  const persistTutor = useChatStore((s) => s.persistTutorStateForMessage);
  // No longer mutates visible assistant content; results are kept in tutor state only
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
  return (
    <div className="space-y-3">
      {items.map((it, idx) => {
        const val = fb[it.id]?.answer || '';
        const shown = !!fb[it.id]?.revealed;
        const ok = shown ? isAccepted(it, val) : undefined;
        return (
          <div
            key={safeKey(it.id, idx, 'blank')}
            className="rounded-md border border-border bg-surface p-3"
          >
            <div className="text-sm font-medium mb-2">
              {idx + 1}. {it.prompt}
            </div>
            <div className="flex items-center gap-2">
              <input
                className="input flex-1"
                placeholder="Type your answer"
                value={val}
                onChange={(e) => {
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
                            [it.id]: { ...(prevFill[it.id] || {}), answer: e.currentTarget.value },
                          },
                        },
                      },
                    },
                  });
                  // Persist typed answer so it survives reloads
                  persistTutor(messageId).catch(() => void 0);
                }}
              />
              <button
                className="btn btn-outline"
                onClick={() => {
                  if (shown) return;
                  const correct = isAccepted(it, val);
                  log({
                    kind: 'fill_blank',
                    itemId: it.id,
                    correct,
                    topic: it.topic,
                    skill: it.skill,
                    difficulty: it.difficulty,
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
                            [it.id]: {
                              ...(prevFill[it.id] || {}),
                              answer: val,
                              revealed: true,
                              correct,
                            },
                          },
                        },
                      },
                    },
                  });
                  // Persist result
                  persistTutor(messageId).catch(() => void 0);
                  // Intentionally avoid appending raw quiz_result blocks to message content
                  // Model memory is handled via sanitized recap preambles.
                  try {
                    // no-op: legacy content mutation removed
                  } catch {}
                }}
              >
                Check
              </button>
              {shown && (
                <span className="badge inline-flex items-center gap-1">
                  {ok ? (
                    <CheckIcon className="h-3.5 w-3.5" />
                  ) : (
                    <XMarkIcon className="h-3.5 w-3.5" />
                  )}
                  {ok ? 'Correct' : 'Try again'}
                </span>
              )}
            </div>
            {shown && !ok && (
              <div className="mt-2 text-xs text-muted-foreground">Answer: {it.answer}</div>
            )}
            {shown && it.explanation && (
              <div className="mt-1 text-xs text-muted-foreground">{it.explanation}</div>
            )}
          </div>
        );
      })}
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
  return (
    <div className="space-y-3">
      {items.map((it, idx) => (
        <div
          key={safeKey(it.id, idx, 'open')}
          className="rounded-md border border-border bg-surface p-3"
        >
          <div className="text-sm font-medium">
            {idx + 1}. {it.prompt}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <button
              className="btn btn-outline btn-sm"
              onClick={() => setRevealed((s) => ({ ...s, [it.id]: !s[it.id] }))}
            >
              <EyeIcon className="h-4 w-4" />
              <span className="ml-1">{revealed[it.id] ? 'Hide' : 'Show'} sample</span>
            </button>
          </div>
          {revealed[it.id] && (
            <div className="mt-2 text-sm">
              {it.sample_answer ? (
                <div>
                  <div className="font-medium mb-1">Sample answer</div>
                  <div className="text-muted-foreground">{it.sample_answer}</div>
                </div>
              ) : it.rubric ? (
                <div>
                  <div className="font-medium mb-1">Rubric</div>
                  <div className="text-muted-foreground">{it.rubric}</div>
                </div>
              ) : null}
            </div>
          )}
          <div className="mt-3 flex items-start gap-2">
            <textarea
              className="textarea flex-1 text-sm"
              rows={3}
              placeholder="Type your response"
              value={open[it.id]?.answer || ''}
              onChange={(e) => {
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
                          [it.id]: { ...(prevOpen[it.id] || {}), answer: e.currentTarget.value },
                        },
                      },
                    },
                  },
                });
                // Persist typed response
                persistTutor(messageId).catch(() => void 0);
              }}
            />
            <button
              className="btn btn-outline self-start"
              onClick={() => {
                const ans = String(open[it.id]?.answer || '').trim();
                if (!ans) return;
                // Ask the tutor to grade this specific item using the grading tool
                const prompt = it.prompt.replace(/\n/g, ' ').slice(0, 200);
                const msg = `Please grade my answer for open-ended item ${it.id} (\"${prompt}\").\nAnswer: ${ans}\nUse the tool grade_open_response with item_id and feedback (and optional score).`;
                send(msg).catch(() => void 0);
              }}
            >
              Get feedback
            </button>
          </div>
          {grading && grading[it.id] && (
            <div className="mt-2 text-sm">
              <div className="font-medium">
                Feedback{' '}
                {grading[it.id].score != null
                  ? `(score: ${Math.round((grading[it.id].score || 0) * 100)}%)`
                  : ''}
              </div>
              <div className="text-muted-foreground whitespace-pre-wrap">
                {grading[it.id].feedback}
              </div>
              {Array.isArray(grading[it.id].criteria) && grading[it.id].criteria!.length > 0 && (
                <div className="mt-1 text-xs text-muted-foreground">
                  Criteria: {grading[it.id].criteria!.join(', ')}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
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
  const [submitting, setSubmitting] = useState(false);
  const setUI = useChatStore((s) => s.setUI);
  const persistTutor = useChatStore((s) => s.persistTutorStateForMessage);
  const sendUserMessage = useChatStore((s) => s.sendUserMessage);
  const isSubmitted = questionnaire.status === 'submitted';

  useEffect(() => {
    // Reset selections if questionnaire updates (e.g., new follow-up)
    setSelections(initialSelections);
  }, [initialSelections]);

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
  };

  const questionCount = questionnaire.questions.length;
  const answeredCount = questionnaire.questions.reduce(
    (count, q) => (selections[q.id]?.length ? count + 1 : count),
    0,
  );
  const allAnswered = questionCount > 0 && answeredCount === questionCount;

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

      const summaryLines = questionnaire.questions.map((q) => {
        const answers = selections[q.id] ?? [];
        const label = q.category ? `${q.category}: ${q.question}` : q.question;
        return `- ${label}: ${answers.join(', ')}`;
      });
      const content = `Questionnaire responses:\n${summaryLines.join('\n')}`;
      await sendUserMessage(content);
    } catch {
      // No-op; UI will remain consistent from state updates above
    } finally {
      setSubmitting(false);
    }
  };

  if (!questionnaire.questions.length) return null;

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
      <div className="space-y-3">
        {questionnaire.questions.map((q) => {
          const allowMultiple = !!q.allowMultiple;
          const selected = selections[q.id] ?? [];
          return (
            <div key={q.id} className="rounded-md border border-border bg-muted/30 p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  {q.category && (
                    <span className="badge badge-sm mr-2 uppercase tracking-wide">
                      {q.category}
                    </span>
                  )}
                  <div className="text-sm font-medium leading-snug">{q.question}</div>
                </div>
                {allowMultiple && (
                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                    Multi-select
                  </span>
                )}
              </div>
              <div className="mt-3 grid gap-2">
                {q.options.map((option, idx) => {
                  const isSelected = selected.includes(option.label);
                  return (
                    <button
                      key={safeKey(option.label, idx, q.id)}
                      className={`btn justify-start ${
                        isSubmitted
                          ? isSelected
                            ? 'btn-primary'
                            : 'btn-outline'
                          : isSelected
                            ? 'btn'
                            : 'btn-outline'
                      }`}
                      onClick={() => handleToggle(q.id, option.label, allowMultiple)}
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
            </div>
          );
        })}
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
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!allAnswered || submitting}
          >
            Submit answers
          </button>
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
      await sendUserMessage(content);
      // Encourage learner to open the detailed plan view
      setUI({ planSheetOpen: true, planSheetPlanOverride: null });
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
    if (diagnostic.status === 'completed') return;
    if (total === 0 || answered !== total) return;
    const state = (useChatStore as any).getState();
    const prevMap = state.ui.tutorByMessageId || {};
    const prevEntry = prevMap[messageId] || {};
    const updatedDiagnostic: TutorDiagnostic = {
      ...diagnostic,
      status: 'completed',
      score: scoreRatio,
    };
    setUI({
      tutorByMessageId: {
        ...prevMap,
        [messageId]: {
          ...prevEntry,
          diagnostic: updatedDiagnostic,
        },
      },
    });
    persistTutor(messageId).catch(() => void 0);
  }, [answered, total, diagnostic, messageId, scoreRatio, setUI, persistTutor]);

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
