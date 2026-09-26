import { useState } from 'react';
import { percent } from '@/modules/tutor/engine';
import {
  marginReason,
  type MasteryChange,
  type NotedMisconception,
} from '@/modules/tutor/ui/messageViews';
import { usePlanCallbacks } from '@/modules/tutor/ui/usePlanCallbacks';
import { useTutorAffordances } from '@/modules/tutor/ui/useTutorFlags';

/**
 * Mastery changes annotated beside the exchange that earned them. The number
 * says what moved, the evidence's own note says why, and the learner can
 * answer "too high" or "too low" in place. That makes the learner model
 * scrutable where it changes and negotiable without spending a turn. A
 * misconception the tutor noticed is said here too, where it happened, and
 * not only in the Hub.
 */
export function MarginNotes({
  changes,
  misconceptions = [],
}: {
  changes: MasteryChange[];
  misconceptions?: NotedMisconception[];
}) {
  const { state, learningPlan, onContestMastery } = usePlanCallbacks();
  const { correctMastery } = useTutorAffordances();
  const [contesting, setContesting] = useState<string | null>(null);
  const [unfolded, setUnfolded] = useState<Record<string, boolean>>({});

  if (!changes.length && !misconceptions.length) return null;
  const nameOf = (nodeId: string) =>
    learningPlan?.nodes.find((n) => n.id === nodeId)?.name ?? nodeId;
  // A note can be answered while it is still the estimate: once anything has
  // moved it since, its numbers are history, and correcting from them would
  // move today's estimate by the wrong amount.
  const current = (nodeId: string) => state.mastery[nodeId]?.confidence;
  const unmoved = [...new Set(misconceptions.map((m) => m.nodeId))].filter(
    (nodeId) => !changes.some((change) => change.nodeId === nodeId),
  );

  const contest = async (nodeId: string, direction: 'up' | 'down') => {
    setContesting(nodeId);
    try {
      await onContestMastery(nodeId, direction);
    } finally {
      setContesting(null);
    }
  };

  return (
    <aside className="margin-notes" aria-label="What the tutor noted">
      {changes.map((change) => {
        const reason = marginReason(change.notes, !!unfolded[change.nodeId]);
        // From the log, so the note keeps its correction after a reload.
        const corrected = change.corrected;
        const answerable = correctMastery && current(change.nodeId) === change.to;
        return (
          <div key={change.nodeId} className="margin-note">
            <p className="margin-note__head">
              <span className="margin-note__topic">{nameOf(change.nodeId)}</span>
              <span
                className="margin-note__delta"
                aria-label={`${percent(change.from)} to ${percent(change.to)} percent`}
              >
                {percent(change.from)}% <span aria-hidden="true">→</span> {percent(change.to)}%
              </span>
            </p>
            {reason.text && (
              <p className="margin-note__reason">
                {reason.text}
                {reason.more > 0 && (
                  <>
                    {' '}
                    <button
                      type="button"
                      className="margin-note__more"
                      onClick={() => setUnfolded((prev) => ({ ...prev, [change.nodeId]: true }))}
                    >
                      +{reason.more} more
                    </button>
                  </>
                )}
              </p>
            )}
            <ToClearUp items={misconceptions.filter((m) => m.nodeId === change.nodeId)} />
            {corrected != null ? (
              <p className="margin-note__answer">
                You told the tutor this felt too {corrected < change.to ? 'high' : 'low'}
                {current(change.nodeId) === corrected
                  ? `. Now ${percent(corrected)}%.`
                  : ` (${percent(corrected)}%).`}
              </p>
            ) : answerable ? (
              // The same control as the Learning Hub's, in the same words.
              <div className="margin-note__answer">
                <span>Seems wrong?</span>
                <span className="estimate-choices" role="group" aria-label="Correct the estimate">
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    disabled={contesting === change.nodeId}
                    onClick={() => void contest(change.nodeId, 'down')}
                  >
                    Too high
                  </button>
                  <button
                    type="button"
                    className="btn-outline btn-sm"
                    disabled={contesting === change.nodeId}
                    onClick={() => void contest(change.nodeId, 'up')}
                  >
                    Too low
                  </button>
                </span>
              </div>
            ) : null}
          </div>
        );
      })}
      {unmoved.map((nodeId) => (
        <div key={nodeId} className="margin-note">
          <p className="margin-note__head">
            <span className="margin-note__topic">{nameOf(nodeId)}</span>
          </p>
          <ToClearUp items={misconceptions.filter((m) => m.nodeId === nodeId)} />
        </div>
      ))}
    </aside>
  );
}

function ToClearUp({ items }: { items: NotedMisconception[] }) {
  if (!items.length) return null;
  return (
    <>
      {items.map((item, i) => (
        <p key={i} className="margin-note__clear">
          <span className="margin-note__clear-label">To clear up</span> {item.description}
        </p>
      ))}
    </>
  );
}
