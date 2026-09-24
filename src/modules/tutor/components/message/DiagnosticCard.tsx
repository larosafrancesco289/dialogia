import { useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useChatStore } from '@/lib/store';
import type { DiagnosticRecord } from '@/modules/tutor/engine';
import { McqCard, type McqAttempts } from '@/modules/tutor/components/message/McqCard';
import { LEDGER } from '@/modules/tutor/lib/ledger';
import { useLedger } from '@/modules/tutor/ui/ledger';

/**
 * A diagnostic: answers are held here until every item has one, then go to
 * the engine together, which scores them into evidence.
 */
export function DiagnosticCard({
  chatId,
  messageId,
  diagnostic,
}: {
  chatId: string;
  messageId: string;
  diagnostic: DiagnosticRecord;
}) {
  const dispatchTutor = useChatStore((s) => s.dispatchTutor);
  const ledger = useLedger();
  const [draft, setDraft] = useState<Record<string, number>>({});
  // The latest answers, so two quick clicks never read the same render's draft.
  const answersRef = useRef<Record<string, number>>({});
  const submitting = useRef(false);
  const submitted = diagnostic.answers;
  const choices = submitted ?? draft;

  const attempts = useMemo(() => {
    const out: McqAttempts = {};
    for (const item of diagnostic.items) {
      const choice = choices[item.id];
      if (typeof choice === 'number') out[item.id] = { choice, correct: choice === item.correct };
    }
    return out;
  }, [choices, diagnostic.items]);

  const total = diagnostic.items.length;
  const answered = Object.keys(attempts).length;
  const scored = diagnostic.items.filter((item) => typeof item.correct === 'number');
  const right = scored.filter((item) => attempts[item.id]?.correct).length;
  const percentComplete = total > 0 ? Math.round((answered / total) * 100) : 0;
  const scorePercent = scored.length ? Math.round((right / scored.length) * 100) : 0;

  const onAnswer = async (itemId: string, choice: number) => {
    if (submitted || submitting.current || itemId in answersRef.current) return;
    const next = { ...answersRef.current, [itemId]: choice };
    answersRef.current = next;
    setDraft(next);
    if (Object.keys(next).length < total) return;
    submitting.current = true;
    const result = await dispatchTutor(
      chatId,
      {
        by: 'learner',
        type: 'answer_diagnostic',
        diagnosticId: diagnostic.diagnosticId,
        answers: next,
      },
      { by: 'learner', messageId },
    ).finally(() => {
      submitting.current = false;
    });
    if (!result.ok) return;
    const correct = scored.filter((item) => next[item.id] === item.correct).length;
    await ledger(LEDGER.diagnosticFinished(correct, scored.length));
  };

  return (
    <div className="exercise">
      <div>
        <h4 className="exercise__title">A quick check on {diagnostic.topic}</h4>
        <p className="exercise__meta">
          A few questions · {answered} of {total} answered
        </p>
      </div>
      <div className="exercise-meter">
        <div className="exercise-meter__track">
          <motion.div
            className="exercise-meter__fill"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: percentComplete / 100 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            style={{ originX: 0 }}
          />
        </div>
        <span className="exercise-meter__pct">{percentComplete}%</span>
      </div>

      <McqCard items={diagnostic.items} attempts={attempts} onAnswer={onAnswer} />

      {answered === total && total > 0 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <p className="exercise__kicker">Score {scorePercent}%</p>
        </motion.div>
      )}
    </div>
  );
}
