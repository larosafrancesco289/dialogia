import { useState } from 'react';
import type { Message } from '@/lib/types';
import { usePlanCallbacks } from '@/modules/tutor/ui/usePlanCallbacks';

type MasteryChange = { nodeId: string; from: number; to: number };

// Evidence recorded during this turn carries a timestamp at or after the
// message began; a little slack covers clock rounding.
const TURN_SLACK_MS = 5_000;

const pct = (value: number) => Math.round(value * 100);

/**
 * Mastery changes annotated beside the exchange that earned them. The number
 * says what moved, the tutor's own evidence says why, and the learner can
 * answer "too high" or "too low" in place. That makes the learner model
 * scrutable where it changes and negotiable without spending a turn.
 */
export function MarginNotes({
  message,
  changes,
  summary,
}: {
  message: Message;
  changes: MasteryChange[];
  summary?: string;
}) {
  const { learningPlan, onContestMastery } = usePlanCallbacks();
  const [adjusted, setAdjusted] = useState<Record<string, number>>({});
  const [contesting, setContesting] = useState<string | null>(null);

  if (!changes.length && !summary) return null;
  const nameOf = (nodeId: string) =>
    learningPlan?.nodes.find((n) => n.id === nodeId)?.name ?? nodeId;

  const reasonFor = (nodeId: string) => {
    const evidence = message.learnerModel?.mastery?.[nodeId]?.evidence ?? [];
    const thisTurn = evidence.filter((e) => e.timestamp >= message.createdAt - TURN_SLACK_MS);
    const picked = thisTurn.length ? thisTurn : evidence.slice(-1);
    return picked
      .map((e) => e.details.trim().replace(/\.$/, ''))
      .filter(Boolean)
      .slice(-2)
      .join('; ');
  };

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
      {summary && <p className="margin-note__reason">{summary}</p>}
      {changes.map((change) => {
        const reason = reasonFor(change.nodeId);
        const rose = change.to >= change.from;
        const corrected = adjusted[change.nodeId];
        return (
          <div key={change.nodeId} className="margin-note">
            <p className="margin-note__head">
              <span className="margin-note__topic">{nameOf(change.nodeId)}</span>
              <span
                className="margin-note__delta"
                aria-label={`${pct(change.from)} to ${pct(change.to)} percent`}
              >
                {pct(change.from)} <span aria-hidden="true">{rose ? '→' : '↘'}</span>{' '}
                {pct(change.to)}
              </span>
            </p>
            {reason && <p className="margin-note__reason">{reason}.</p>}
            {corrected != null ? (
              <p className="margin-note__answer">Now {pct(corrected)}%, from your correction</p>
            ) : (
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
            )}
          </div>
        );
      })}
    </aside>
  );
}
