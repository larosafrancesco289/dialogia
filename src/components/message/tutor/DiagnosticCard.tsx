'use client';
import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ChartBarIcon } from '@heroicons/react/24/outline';
import type { TutorDiagnostic, TutorMCQItem } from '@/lib/types';
import { useChatStore } from '@/lib/store';
import { McqCard } from '@/components/message/tutor/McqCard';

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
    <div className="marginalia">
      <div className="flex items-center gap-3 mb-4">
        <div className="rounded-full bg-[var(--color-accent)]/10 p-2">
          <ChartBarIcon className="h-5 w-5 text-[var(--color-accent)]" />
        </div>
        <div className="flex flex-col">
          <span className="text-sm font-semibold leading-tight text-[var(--color-fg)]">
            Diagnostic · {diagnostic.topic}
          </span>
          <span className="text-xs text-[var(--color-fg-muted)]">
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
        <div className="h-2 flex-1 rounded-full bg-[var(--color-muted)] overflow-hidden">
          <motion.div
            className="h-full bg-[var(--color-accent)]/60"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: percentComplete / 100 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            style={{ originX: 0 }}
          />
        </div>
        <span className="text-xs text-[var(--color-fg-muted)] font-medium w-8 text-right">
          {percentComplete}%
        </span>
      </div>

      <div className="mt-4">
        <McqCard messageId={messageId} items={mcqItems} />
      </div>

      {answered === total && total > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-[var(--radius-editorial)] border border-[var(--color-border)]/60 bg-[var(--color-muted)]/20 p-4 text-xs text-[var(--color-fg-muted)]"
        >
          <div className="font-bold text-[var(--color-fg)] text-sm mb-1">
            Score: {scorePercent}%
          </div>
          {interpretation && <div className="leading-relaxed">{interpretation}</div>}
        </motion.div>
      )}
    </div>
  );
}
