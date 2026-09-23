import type { Evidence, TopicMastery } from '@/lib/types';
import { calculateMastery, MASTERY_PRIOR } from './core';

/**
 * One move of the estimate. Without `evidence` it is a direct placement that
 * older histories did not record (see `explainMastery`).
 */
export type MasteryStep = { evidence?: Evidence; before: number; after: number };

export type MasteryExplanation = {
  start: number;
  /** Oldest first: how each piece of evidence moved the estimate. */
  steps: MasteryStep[];
};

/** The estimate before `evidence` moved it to `after`: the update, run backwards. */
function unapply(after: number, evidence: Evidence): number {
  const w = evidence.weight;
  if (w >= 0) return w >= 1 ? after : Math.min(1, Math.max(0, (after - w) / (1 - w)));
  return w <= -1 ? after : Math.min(1, Math.max(0, after / (1 + w)));
}

/**
 * Replays a topic's evidence through the same update the learner model uses,
 * so "Why 34%" can say where the estimate started and what each item did,
 * and the steps always add up to the value shown.
 *
 * Direct placements (a slider, a floor) are recorded as evidence with
 * `setTo`, so a replay from the prior lands exactly. Histories written before
 * that do not reach the current value; for those the evidence after the last
 * recorded placement is replayed backwards from the current value, and the
 * gap becomes one direct placement at the start of that stretch, the oldest
 * point it could have happened.
 */
export function explainMastery(mastery: TopicMastery): MasteryExplanation {
  const forward: MasteryStep[] = [];
  let current = MASTERY_PRIOR;
  for (const evidence of mastery.evidence) {
    const after = calculateMastery(current, evidence);
    forward.push({ evidence, before: current, after });
    current = after;
  }
  if (Math.abs(current - mastery.confidence) < 0.005) {
    return { start: MASTERY_PRIOR, steps: forward };
  }

  let lastSet = -1;
  mastery.evidence.forEach((evidence, i) => {
    if (typeof evidence.setTo === 'number') lastSet = i;
  });
  const head = forward.slice(0, lastSet + 1);
  const reached = head.length ? head[head.length - 1].after : MASTERY_PRIOR;

  const tail: MasteryStep[] = [];
  let after = mastery.confidence;
  for (let i = mastery.evidence.length - 1; i > lastSet; i -= 1) {
    const evidence = mastery.evidence[i];
    const before = unapply(after, evidence);
    tail.unshift({ evidence, before, after });
    after = before;
  }

  const placement: MasteryStep[] =
    Math.abs(after - reached) >= 0.005 ? [{ before: reached, after }] : [];
  return { start: MASTERY_PRIOR, steps: [...head, ...placement, ...tail] };
}
