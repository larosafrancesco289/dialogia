import { useState } from 'react';
import { percent } from '@/modules/tutor/engine';
import type { MasteryChange } from '@/modules/tutor/ui/messageViews';
import { usePlanCallbacks } from '@/modules/tutor/ui/usePlanCallbacks';
import { useTutorAffordances } from '@/modules/tutor/ui/useTutorFlags';

/** The event notes behind a change, as one short reason. */
const reasonOf = (notes: string[]) =>
  notes
    .map((note) => note.trim().replace(/\.$/, ''))
    .filter(Boolean)
    .slice(-2)
    .join('; ');

/**
 * Mastery changes annotated beside the exchange that earned them. The number
 * says what moved, the evidence's own note says why, and the learner can
 * answer "too high" or "too low" in place. That makes the learner model
 * scrutable where it changes and negotiable without spending a turn.
 */
export function MarginNotes({ changes }: { changes: MasteryChange[] }) {
  const { state, learningPlan, onContestMastery } = usePlanCallbacks();
  const { correctMastery } = useTutorAffordances();
  const [adjusted, setAdjusted] = useState<Record<string, number>>({});
  const [contesting, setContesting] = useState<string | null>(null);

  if (!changes.length) return null;
  const nameOf = (nodeId: string) =>
    learningPlan?.nodes.find((n) => n.id === nodeId)?.name ?? nodeId;
  // A note can be answered while it is still the estimate: once anything has
  // moved it since, its numbers are history, and correcting from them would
  // move today's estimate by the wrong amount.
  const current = (nodeId: string) => state.mastery[nodeId]?.confidence;

  const contest = async (nodeId: string, direction: 'up' | 'down') => {
    setContesting(nodeId);
    try {
      const next = await onContestMastery(nodeId, direction);
      if (next != null) setAdjusted((prev) => ({ ...prev, [nodeId]: next }));
    } finally {
      setContesting(null);
    }
  };

  return (
    <aside className="margin-notes" aria-label="What the tutor noted">
      {changes.map((change) => {
        const reason = reasonOf(change.notes);
        const rose = change.to >= change.from;
        const corrected = adjusted[change.nodeId];
        const answerable = correctMastery && current(change.nodeId) === change.to;
        return (
          <div key={change.nodeId} className="margin-note">
            <p className="margin-note__head">
              <span className="margin-note__topic">{nameOf(change.nodeId)}</span>
              <span
                className="margin-note__delta"
                aria-label={`${percent(change.from)} to ${percent(change.to)} percent`}
              >
                {percent(change.from)} <span aria-hidden="true">{rose ? '→' : '↘'}</span>{' '}
                {percent(change.to)}
              </span>
            </p>
            {reason && <p className="margin-note__reason">{reason}.</p>}
            {corrected != null ? (
              <p className="margin-note__answer">Now {percent(corrected)}%, from your correction</p>
            ) : answerable ? (
              <p className="margin-note__answer">
                <span>Not how it feels?</span>
                <button
                  type="button"
                  className="margin-note__contest"
                  disabled={contesting === change.nodeId}
                  onClick={() => void contest(change.nodeId, 'down')}
                >
                  Too high
                </button>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  className="margin-note__contest"
                  disabled={contesting === change.nodeId}
                  onClick={() => void contest(change.nodeId, 'up')}
                >
                  Too low
                </button>
              </p>
            ) : null}
          </div>
        );
      })}
    </aside>
  );
}
