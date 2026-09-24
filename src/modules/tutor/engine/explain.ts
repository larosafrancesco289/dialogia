// Module: tutor engine explain
// Responsibility: "Why N%": a forward replay of a topic's logged evidence that lands on the stored value.

import type { Evidence } from '@/lib/types';
import { MASTERY_PRIOR, applyEvidence, percent } from '@/modules/tutor/engine/rules';
import type { TutorState } from '@/modules/tutor/engine/state';

export type ExplanationStep = {
  eventId: string;
  at: number;
  source: Evidence['source'];
  kind?: string;
  before: number;
  after: number;
  /** One plain sentence, e.g. `Quiz, right: "..." (+40% of the gap): 30% -> 58%`. */
  text: string;
};

export type TopicExplanation = {
  nodeId: string;
  name: string;
  start: number;
  /** Where the replay starts: the prior, or the estimate carried over from before the log. */
  startText: string;
  steps: ExplanationStep[];
  confidence: number;
};

/** Quiz and diagnostic notes already name their source ("Quiz, right: ..."). */
const SOURCE_LABEL: Record<NonNullable<Evidence['source']>, string | null> = {
  quiz: null,
  diagnostic: null,
  observation: 'The tutor observed',
  learner_said: 'You told the tutor',
  learner: 'You',
  placement: 'Starting estimate',
};

function describe(entry: Evidence, before: number, after: number): string {
  const label = entry.source ? SOURCE_LABEL[entry.source] : 'Evidence';
  const head = label ? (entry.details ? `${label}: ${entry.details}` : label) : entry.details;
  const move =
    typeof entry.setTo === 'number'
      ? 'set directly'
      : entry.weight >= 0
        ? `+${percent(entry.weight)}% of the gap to 100%`
        : `-${percent(-entry.weight)}% of the estimate`;
  return `${head} (${move}): ${percent(before)}% -> ${percent(after)}%`;
}

/**
 * Replays the topic's logged evidence through the same update `fold` uses,
 * in the same order, from the same start, so the last step is the stored
 * value exactly. Entries from before the event log are summarized by the
 * carried-over baseline rather than replayed.
 */
export function explainTopic(state: TutorState, nodeId: string): TopicExplanation | undefined {
  const mastery = state.mastery[nodeId];
  if (!mastery) return undefined;
  const name = state.plan?.nodes.find((n) => n.id === nodeId)?.name ?? nodeId;
  const start = mastery.baseline ?? MASTERY_PRIOR;
  const startText =
    mastery.baseline != null
      ? `Carried over from before: ${percent(start)}%.`
      : `Every topic starts at ${percent(start)}%.`;
  const steps: ExplanationStep[] = [];
  let current = start;
  for (const entry of mastery.evidence) {
    if (!entry.eventId) continue;
    const after = applyEvidence(current, { weight: entry.weight, setTo: entry.setTo });
    steps.push({
      eventId: entry.eventId,
      at: entry.timestamp,
      source: entry.source,
      kind: entry.kind,
      before: current,
      after,
      text: describe(entry, current, after),
    });
    current = after;
  }
  return { nodeId, name, start, startText, steps, confidence: current };
}
