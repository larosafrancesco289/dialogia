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

export function TutorPanel(props: {
  title?: string;
  mcq?: TutorMCQItem[];
  fillBlank?: TutorFillBlankItem[];
  openEnded?: TutorOpenItem[];
  flashcards?: TutorFlashcardItem[];
}) {
  const { title, mcq, fillBlank, openEnded, flashcards } = props;
  const hasAny = (mcq && mcq.length) || (fillBlank && fillBlank.length) || (openEnded && openEnded.length) || (flashcards && flashcards.length);
  if (!hasAny) return null;
  return (
    <div className="px-4 pt-3">
      <div className="rounded-lg border border-border bg-muted/40">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <AcademicCapIcon className="h-4 w-4" />
          <div className="text-sm font-medium truncate">{title || 'Tutor Tools'}</div>
        </div>
        <div className="p-3 space-y-4">
          {mcq && mcq.length > 0 && <MCQList items={mcq} />}
          {fillBlank && fillBlank.length > 0 && <FillBlankList items={fillBlank} />}
          {openEnded && openEnded.length > 0 && <OpenEndedList items={openEnded} />}
          {flashcards && flashcards.length > 0 && <FlashcardList items={flashcards} />}
        </div>
      </div>
    </div>
  );
}

function MCQList({ items }: { items: TutorMCQItem[] }) {
  const [answers, setAnswers] = useState<Record<string, number | undefined>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});
  const log = useChatStore((s) => s.logTutorResult);
  return (
    <div className="space-y-3">
      {items.map((q, idx) => {
        const picked = answers[q.id];
        const correctIdx = typeof q.correct === 'number' ? q.correct : -1;
        return (
          <div key={q.id} className="rounded-md border border-border bg-surface">
            <div className="px-3 py-2 text-sm font-medium">
              {idx + 1}. {q.question}
            </div>
            <div className="px-3 pb-2 grid gap-2">
              {q.choices.map((c, i) => {
                const isPicked = picked === i;
                const isCorrect = correctIdx === i;
                const answered = !!done[q.id];
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
                      if (done[q.id]) return;
                      setAnswers((s) => ({ ...s, [q.id]: i }));
                      setDone((s) => ({ ...s, [q.id]: true }));
                      const correct = i === correctIdx;
                      log({ kind: 'mcq', itemId: q.id, correct, topic: q.topic, skill: q.skill, difficulty: q.difficulty });
                    }}
                    disabled={!!done[q.id]}
                  >
                    <span className="min-w-5 text-xs font-semibold">{String.fromCharCode(65 + i)}</span>
                    <span className="ml-2">{c}</span>
                  </button>
                );
              })}
              {done[q.id] && typeof picked === 'number' && (
                <span className="badge inline-flex items-center gap-1 w-fit">
                  {picked === correctIdx ? (
                    <><CheckIcon className="h-3.5 w-3.5" /> Correct</>
                  ) : (
                    <><XMarkIcon className="h-3.5 w-3.5" /> Incorrect</>
                  )}
                </span>
              )}
              {done[q.id] && q.explanation && (
                <div className="text-xs text-muted-foreground">{q.explanation}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function FillBlankList({ items }: { items: TutorFillBlankItem[] }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const log = useChatStore((s) => s.logTutorResult);
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
        const val = answers[it.id] || '';
        const shown = revealed[it.id];
        const ok = shown ? isAccepted(it, val) : undefined;
        return (
          <div key={it.id} className="rounded-md border border-border bg-surface p-3">
            <div className="text-sm font-medium mb-2">{idx + 1}. {it.prompt}</div>
            <div className="flex items-center gap-2">
              <input
                className="input flex-1"
                placeholder="Type your answer"
                value={val}
                onChange={(e) => setAnswers((s) => ({ ...s, [it.id]: e.currentTarget.value }))}
              />
              <button
                className="btn btn-outline"
                onClick={() => {
                  if (shown) return;
                  const correct = isAccepted(it, val);
                  setRevealed((s) => ({ ...s, [it.id]: true }));
                  log({ kind: 'fill_blank', itemId: it.id, correct, topic: it.topic, skill: it.skill, difficulty: it.difficulty });
                }}
              >
                Check
              </button>
              {shown && (
                <span className="badge inline-flex items-center gap-1">
                  {ok ? <CheckIcon className="h-3.5 w-3.5" /> : <XMarkIcon className="h-3.5 w-3.5" />}
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

function OpenEndedList({ items }: { items: TutorOpenItem[] }) {
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  return (
    <div className="space-y-3">
      {items.map((it, idx) => (
        <div key={it.id} className="rounded-md border border-border bg-surface p-3">
          <div className="text-sm font-medium">{idx + 1}. {it.prompt}</div>
          <div className="mt-2 flex items-center gap-2">
            <button className="btn btn-outline btn-sm" onClick={() => setRevealed((s) => ({ ...s, [it.id]: !s[it.id] }))}>
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
        </div>
      ))}
    </div>
  );
}

function FlashcardList({ items }: { items: TutorFlashcardItem[] }) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const log = useChatStore((s) => s.logTutorResult);
  const total = items.length;
  const cur = items[Math.min(index, total - 1)];
  if (!cur) return null;
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="text-xs text-muted-foreground mb-2">
        Card {index + 1} / {total}
      </div>
      <div className={`flashcard ${flipped ? 'is-flipped' : ''}`} onClick={() => setFlipped((x) => !x)}>
        <div className="flashcard-inner">
          <div className="flashcard-face flashcard-front">
            <div className="rounded-md border border-border p-4 bg-muted/30 min-h-24 whitespace-pre-wrap">{cur.front}</div>
          </div>
          <div className="flashcard-face flashcard-back">
            <div className="rounded-md border border-border p-4 bg-muted/30 min-h-24 whitespace-pre-wrap">{cur.back}</div>
          </div>
        </div>
      </div>
      {cur.hint && !flipped && (
        <div className="mt-2 text-xs text-muted-foreground">Hint: {cur.hint}</div>
      )}
      <div className="mt-3 flex items-center gap-2">
        <button className="btn btn-outline" onClick={() => setFlipped((x) => !x)}>Flip</button>
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
          onClick={() => log({ kind: 'flashcard', itemId: cur.id, correct: true, topic: cur.topic, skill: cur.skill, difficulty: cur.difficulty })}
        >
          I knew it
        </button>
        <button
          className="btn btn-outline"
          onClick={() => log({ kind: 'flashcard', itemId: cur.id, correct: false, topic: cur.topic, skill: cur.skill, difficulty: cur.difficulty })}
        >
          Need review
        </button>
      </div>
    </div>
  );
}
