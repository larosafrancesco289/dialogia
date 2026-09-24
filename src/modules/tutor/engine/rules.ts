// Module: tutor engine rules
// Responsibility: every number the tutor obeys, and the one mastery update that uses them.

import type { Evidence } from '@/lib/types';

/** Every topic's estimate starts here, before any evidence. */
export const MASTERY_PRIOR = 0.3;

/** The one readiness threshold: completing as mastered, the "ready" band, the mark-known floor. */
export const READY = 0.8;

/**
 * Completing a topic as mastered needs at least this many pieces of evidence
 * from this session's work on it (answers or observations), so a starting
 * estimate plus one lucky answer is never "mastered".
 */
export const MASTERY_EVIDENCE_MIN = 2;

/** Below this a topic is still being built; between it and READY it is being practised. */
export const PRACTISING = 0.5;

/**
 * The highest starting estimate a plan may give a topic from intake or
 * diagnostic evidence: below READY, so the tutor still checks the topic before
 * it counts as ready. A learner who knows a topic can mark it known.
 */
export const STARTING_ESTIMATE_MAX = Math.round((READY - 0.05) * 100) / 100;

/** "More practice" pulls an estimate down to at most this. */
export const MORE_PRACTICE_CAP = Math.round((READY - 0.2) * 100) / 100;

/** "Too high" / "Too low" on an estimate moves it by this much, as a direct setting. */
export const CONTEST_STEP = 0.15;

export const WEIGHT_MIN = -0.5;
export const WEIGHT_MAX = 0.7;

export const QUIZ_WEIGHTS = { correct: 0.4, incorrect: -0.3 } as const;
export const DIAGNOSTIC_WEIGHTS = { correct: 0.3, incorrect: -0.2 } as const;

/** Budgets are counted from events, so they survive a reload. */
export const BUDGETS = {
  /** Per topic, counted since the topic was last reopened. */
  quizzesPerTopic: 3,
  /** Per chat. */
  diagnosticsPerSession: 2,
} as const;

export const LIMITS = {
  planNodes: { min: 1, max: 20 },
  objectives: { min: 1, max: 6 },
  intakeQuestions: { min: 2, max: 5 },
  intakeOptions: { min: 2, max: 6 },
  quizItems: { min: 1, max: 5 },
  diagnosticItems: { min: 3, max: 8 },
  choices: { min: 2, max: 6 },
} as const;

/** What the tutor may observe in conversation. */
export const OBSERVATION_KINDS = [
  'explained',
  'applied',
  'insight',
  'partial',
  'struggled',
] as const;
export type ObservationKind = (typeof OBSERVATION_KINDS)[number];

/** Default weight per observation, used when the tutor gives none. */
export const OBSERVATION_WEIGHTS: Record<ObservationKind, number> = {
  explained: 0.2,
  applied: 0.3,
  insight: 0.3,
  partial: 0.1,
  struggled: -0.2,
};

/**
 * A step the tutor led the learner to (named the operation, gave a strong hint,
 * started it for them) shows less than one they took alone, so its upward
 * weight is scaled down.
 */
export const HELPED_FACTOR = 0.4;

/** Which way each observation may move the estimate. `partial` may go either way. */
export const OBSERVATION_SIGN: Record<ObservationKind, 1 | -1 | 0> = {
  explained: 1,
  applied: 1,
  insight: 1,
  partial: 0,
  struggled: -1,
};

export type EvidenceKind =
  | 'correct_answer'
  | 'incorrect_answer'
  | ObservationKind
  | 'marked_known'
  | 'more_practice'
  | 'adjusted'
  | 'placement';

const LEGACY_TYPE: Record<EvidenceKind, Evidence['type']> = {
  correct_answer: 'correct_answer',
  incorrect_answer: 'incorrect_answer',
  explained: 'insight_demonstrated',
  applied: 'correct_answer',
  insight: 'insight_demonstrated',
  partial: 'partial_answer',
  struggled: 'hint_needed',
  marked_known: 'self_report',
  more_practice: 'self_report',
  adjusted: 'self_report',
  placement: 'placement',
};

/** The persisted `Evidence.type` that older surfaces understand. */
export function legacyEvidenceType(kind: EvidenceKind): Evidence['type'] {
  return LEGACY_TYPE[kind];
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function clampWeight(weight: number): number {
  return Math.min(WEIGHT_MAX, Math.max(WEIGHT_MIN, weight));
}

/**
 * The update rule (paper, eq. 1). Positive evidence closes a share of the gap
 * to 1, negative evidence removes a share of what is there, and a direct
 * placement (`setTo`) overrides both.
 */
export function applyEvidence(
  confidence: number,
  step: { weight?: number; setTo?: number },
): number {
  if (typeof step.setTo === 'number') return clamp01(step.setTo);
  const w = clampWeight(step.weight ?? 0);
  if (w > 0) return clamp01(confidence + w * (1 - confidence));
  if (w < 0) return clamp01(confidence + w * confidence);
  return confidence;
}

export function quizWeight(correct: boolean): number {
  return correct ? QUIZ_WEIGHTS.correct : QUIZ_WEIGHTS.incorrect;
}

export function diagnosticWeight(correct: boolean): number {
  return correct ? DIAGNOSTIC_WEIGHTS.correct : DIAGNOSTIC_WEIGHTS.incorrect;
}

/** "I know this": a floor at READY. It never lowers an estimate. */
export function markKnownTarget(confidence: number): number {
  return Math.max(confidence, READY);
}

/** "I need more practice": a cap below READY. It never raises an estimate. */
export function morePracticeTarget(confidence: number): number {
  return Math.min(confidence, MORE_PRACTICE_CAP);
}

/** Where "Too high" / "Too low" puts an estimate: one step, to the whole percent. */
export function contestTarget(confidence: number, direction: 'up' | 'down'): number {
  const step = direction === 'up' ? CONTEST_STEP : -CONTEST_STEP;
  return Math.round(clamp01(confidence + step) * 100) / 100;
}

export type MasteryBand = 'building' | 'practising' | 'ready';

export function masteryBand(confidence: number): MasteryBand {
  if (confidence >= READY) return 'ready';
  if (confidence >= PRACTISING) return 'practising';
  return 'building';
}

export function percent(confidence: number): number {
  return Math.round(confidence * 100);
}
