import type { Evidence, TopicMastery } from '@/lib/types';
import { calculateMastery, MASTERY_PRIOR } from './core';

export type MasteryStep = { evidence: Evidence; before: number; after: number };

export type MasteryExplanation = {
  start: number;
  /** Oldest first: how each piece of evidence moved the estimate. */
  steps: MasteryStep[];
  /**
   * Set when the estimate was placed directly (a slider, a floor, a quiz
   * override) rather than reached through the evidence; the replay then ends
   * elsewhere and the value it was set to is stated instead of implied.
   */
  setDirectlyTo?: number;
};

/**
 * Replays a topic's evidence through the same update the learner model uses,
 * so "Why 34%" can say where the estimate started and what each item did.
 */
export function explainMastery(mastery: TopicMastery): MasteryExplanation {
  let current = MASTERY_PRIOR;
  const steps: MasteryStep[] = [];
  for (const evidence of mastery.evidence) {
    const after = calculateMastery(current, evidence);
    steps.push({ evidence, before: current, after });
    current = after;
  }
  const drift = Math.abs(current - mastery.confidence) >= 0.005;
  return {
    start: MASTERY_PRIOR,
    steps,
    ...(drift ? { setDirectlyTo: mastery.confidence } : {}),
  };
}
