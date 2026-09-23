import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import type { TutorDiagnostic, TutorMCQItem } from '@/lib/types';
import { useChatStore } from '@/lib/store';
import { McqCard } from '@/modules/tutor/components/message/McqCard';

export function DiagnosticCard({
  messageId,
  diagnostic,
}: {
  messageId: string;
  diagnostic: TutorDiagnostic;
}) {
  const patchTutorEntry = useChatStore((s) => s.patchTutorEntry);
  const sendUserMessage = useChatStore((s) => s.sendUserMessage);
  const tutorEntry = useChatStore((s) => s.ui.tutor?.byMessageId?.[messageId]);
  const attempts = tutorEntry?.attempts;
  const mcqAttempts: Record<string, { done?: boolean; correct?: boolean }> = attempts?.mcq ?? {};

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
    const prevDiagnosticMeta = tutorEntry?.diagnosticMeta || {};
    const prevCompletion = prevDiagnosticMeta.completedAt || {};
    const alreadyRecorded = !!prevCompletion[diagnostic.diagnosticId];
    const now = Date.now();

    const needsStatusUpdate =
      diagnostic.status !== 'completed' || typeof diagnostic.score !== 'number';
    if (needsStatusUpdate || !alreadyRecorded) {
      const updatedDiagnostic: TutorDiagnostic = needsStatusUpdate
        ? { ...diagnostic, status: 'completed', score: scoreRatio }
        : diagnostic;
      void patchTutorEntry(messageId, {
        diagnostic: updatedDiagnostic,
        diagnosticMeta: {
          ...prevDiagnosticMeta,
          completedAt: {
            ...prevCompletion,
            [diagnostic.diagnosticId]: now,
          },
        },
      });
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
    patchTutorEntry,
    sendUserMessage,
    tutorEntry,
  ]);

  const mcqItems: TutorMCQItem[] = useMemo(
    () =>
      diagnostic.items.map((item) => {
        let normalizedDifficulty: TutorMCQItem['difficulty'] | undefined;
        if (item.difficulty === 'beginner') normalizedDifficulty = 'easy';
        else if (item.difficulty === 'intermediate') normalizedDifficulty = 'medium';
        else if (item.difficulty === 'advanced') normalizedDifficulty = 'hard';
        else if (
          item.difficulty === 'easy' ||
          item.difficulty === 'medium' ||
          item.difficulty === 'hard'
        )
          normalizedDifficulty = item.difficulty;
        return {
          id: item.id,
          question: item.question,
          choices: item.choices,
          correct: typeof item.correct === 'number' ? item.correct : -1,
          explanation: item.explanation,
          topic: item.skill,
          skill: item.skill,
          difficulty: normalizedDifficulty,
        };
      }),
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
    <div className="exercise">
      <div>
        <h4 className="exercise__title">A quick check on {diagnostic.topic}</h4>
        <p className="exercise__meta">
          {diagnostic.depth === 'comprehensive'
            ? 'A thorough check'
            : diagnostic.depth === 'moderate'
              ? 'A moderate check'
              : 'A few questions'}
          {' · '}
          {answered} of {total} answered
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

      <McqCard messageId={messageId} items={mcqItems} />

      {answered === total && total > 0 && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          <p className="exercise__kicker">Score {scorePercent}%</p>
          {interpretation && <p className="exercise__aside mt-2">{interpretation}</p>}
        </motion.div>
      )}
    </div>
  );
}
