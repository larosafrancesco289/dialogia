'use client';
import { useState } from 'react';
import { AcademicCapIcon, CheckIcon, XMarkIcon, EyeIcon } from '@heroicons/react/24/outline';
import type {
  TutorMCQItem,
  TutorFillBlankItem,
  TutorOpenItem,
  TutorFlashcardItem,
} from '@/lib/types';
import { useChatStore } from '@/lib/store';

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
  grading?: Record<string, { score?: number; feedback: string; criteria?: string[] }>;
}) {
  const { messageId, title, mcq, fillBlank, openEnded, flashcards, grading } = props;
  const hasAny =
    (mcq && mcq.length) ||
    (fillBlank && fillBlank.length) ||
    (openEnded && openEnded.length) ||
    (flashcards && flashcards.length);
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
          {mcq && mcq.length > 0 && <MCQList messageId={messageId} items={mcq} />}
          {fillBlank && fillBlank.length > 0 && (
            <FillBlankList messageId={messageId} items={fillBlank} />
          )}
          {openEnded && openEnded.length > 0 && (
            <OpenEndedList messageId={messageId} items={openEnded} grading={grading} />
          )}
          {flashcards && flashcards.length > 0 && <FlashcardList items={flashcards} />}
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
