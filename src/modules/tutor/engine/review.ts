// Module: tutor engine review
// Responsibility: when each studied topic is due for a refresher, derived from the dates and
// outcomes of the learner's own answers on it. Nothing here is stored: the log stays the record.

import type { Evidence, LearningPlanNode } from '@/lib/types';
import type { TutorState } from '@/modules/tutor/engine/state';

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/**
 * Answers on a topic closer together than this belong to one sitting. Six
 * hours keeps an evening's work together and separates it from the next
 * morning's, which is where spacing starts to help.
 */
export const SITTING_GAP_MS = 6 * HOUR_MS;

/**
 * The schedule is an expanding interval in the spirit of FSRS, cut down to the
 * one quantity the log can support: how many days a topic is expected to hold
 * (`intervalDays`). The first sitting earns `first`. A later sitting answered
 * cleanly adds `growth` times the days since the one before, so a refresher
 * taken when due multiplies the interval by about 2.5 (1, 2.5, 6, 16, 39 days)
 * while one taken an hour early adds almost nothing, and a topic still held
 * after a long gap is trusted for longer. A mixed sitting keeps the interval;
 * one with more wrong answers than right starts it again. We fit no per-learner
 * memory model: a tutor chat has a handful of answers per topic, far too few
 * for FSRS's parameters, and the rule has to be explainable in one sentence.
 */
export const REVIEW_INTERVAL = { first: 1, growth: 1.5, max: 180 } as const;

/**
 * A topic comes due this long before its interval runs out, so a topic studied
 * in the evening is ready again the next afternoon rather than the next night.
 */
export const DUE_EARLY_MS = 6 * HOUR_MS;

export type SittingOutcome = 'clean' | 'mixed' | 'lapsed';

export type Sitting = {
  start: number;
  end: number;
  right: number;
  wrong: number;
  outcome: SittingOutcome;
};

export type TopicSchedule = {
  nodeId: string;
  /** When the learner last answered on the topic themselves. */
  lastStudiedAt: number;
  /** How many days the topic is expected to hold after that. */
  intervalDays: number;
  /** When it is due for a refresher. */
  dueAt: number;
  /** The learner flagged it for review, which makes it due now. */
  flagged: boolean;
  sittings: Sitting[];
};

/**
 * The learner's own answers on a topic, oldest first: quiz and diagnostic
 * answers and what the tutor observed, not a starting estimate, a placement,
 * a learner's correction or history from before the log.
 */
function ownAnswers(evidence: readonly Evidence[]): Array<{ at: number; mark: -1 | 0 | 1 }> {
  const takenBack = new Set(
    evidence.filter((entry) => entry.kind === 'misconception').map((entry) => entry.ref?.eventId),
  );
  return evidence
    .filter(
      (entry) =>
        !!entry.eventId &&
        entry.kind !== 'placement' &&
        entry.kind !== 'misconception' &&
        (entry.source === 'quiz' ||
          entry.source === 'diagnostic' ||
          entry.source === 'observation'),
    )
    .map((entry) => {
      // An answer whose gain was taken back showed a misconception: a miss.
      if (takenBack.has(entry.eventId) || entry.weight < 0)
        return { at: entry.timestamp, mark: -1 };
      // Right on their own; a partly right answer, or one they were led to, is neither.
      const clean = entry.weight > 0 && entry.kind !== 'partial' && !entry.helped;
      return { at: entry.timestamp, mark: clean ? 1 : 0 };
    });
}

/** @internal The learner's answers on a topic, grouped into sittings, oldest first. */
export function sittingsOf(evidence: readonly Evidence[]): Sitting[] {
  const sittings: Sitting[] = [];
  for (const answer of ownAnswers(evidence)) {
    let sitting = sittings.at(-1);
    if (!sitting || answer.at - sitting.end >= SITTING_GAP_MS) {
      sitting = { start: answer.at, end: answer.at, right: 0, wrong: 0, outcome: 'mixed' };
      sittings.push(sitting);
    }
    sitting.end = Math.max(sitting.end, answer.at);
    if (answer.mark > 0) sitting.right += 1;
    if (answer.mark < 0) sitting.wrong += 1;
  }
  for (const sitting of sittings) {
    sitting.outcome =
      sitting.right > 0 && sitting.wrong === 0
        ? 'clean'
        : sitting.wrong > sitting.right
          ? 'lapsed'
          : 'mixed';
  }
  return sittings;
}

/** @internal Days a topic is expected to hold after the last of these sittings. */
export function intervalAfter(sittings: readonly Sitting[]): number {
  let interval: number = REVIEW_INTERVAL.first;
  sittings.forEach((sitting, i) => {
    if (i === 0) return;
    const gapDays = Math.max(0, sitting.start - sittings[i - 1].end) / DAY_MS;
    if (sitting.outcome === 'clean') {
      interval = Math.min(REVIEW_INTERVAL.max, interval + REVIEW_INTERVAL.growth * gapDays);
    } else if (sitting.outcome === 'lapsed') {
      interval = REVIEW_INTERVAL.first;
    }
  });
  return interval;
}

/**
 * Whether a topic is one to come back to: worked on in this chat and not in
 * progress now. Not one the learner left ("skipped") or said they already knew
 * ("known"): asking them to prove either would argue with their own call.
 */
function isReviewable(node: LearningPlanNode): boolean {
  if (node.status === 'in_progress') return false;
  if (node.completedHow === 'skipped' || node.completedHow === 'known') return false;
  return node.completedHow === 'mastered' || node.startedAt != null;
}

/** The topic's refresher schedule, or undefined when it is not one to come back to (yet). */
export function topicSchedule(state: TutorState, nodeId: string): TopicSchedule | undefined {
  const node = state.plan?.nodes.find((n) => n.id === nodeId);
  const mastery = state.mastery[nodeId];
  if (!node || !mastery || !isReviewable(node)) return undefined;
  const sittings = sittingsOf(mastery.evidence);
  const last = sittings.at(-1);
  if (!last) return undefined;
  const intervalDays = intervalAfter(sittings);
  return {
    nodeId,
    lastStudiedAt: last.end,
    intervalDays,
    dueAt: last.end + intervalDays * DAY_MS,
    flagged: !!mastery.needsReview,
    sittings,
  };
}

export function isDue(schedule: TopicSchedule, now: number): boolean {
  return schedule.flagged || schedule.dueAt - DUE_EARLY_MS <= now;
}

/** Every topic with a schedule, in plan order. */
export function reviewSchedule(state: TutorState): TopicSchedule[] {
  return (state.plan?.nodes ?? []).flatMap((node) => {
    const schedule = topicSchedule(state, node.id);
    return schedule ? [schedule] : [];
  });
}

/** The topics due for a refresher at `now`, the longest overdue first. */
export function dueTopics(state: TutorState, now: number): TopicSchedule[] {
  return reviewSchedule(state)
    .filter((schedule) => isDue(schedule, now))
    .sort((a, b) => Number(b.flagged) - Number(a.flagged) || a.dueAt - b.dueAt);
}

/** When the learner last answered on the topic themselves, from any state of it. */
export function lastStudiedAt(state: TutorState, nodeId: string): number | undefined {
  return sittingsOf(state.mastery[nodeId]?.evidence ?? []).at(-1)?.end;
}

/** Whole days from `from` to `to`, never negative. */
export function daysBetween(from: number, to: number): number {
  return Math.max(0, Math.floor((to - from) / DAY_MS));
}

/**
 * Whether a topic may take a review quiz, outside the topic in progress: one
 * it has a schedule for. The answers count toward it, and a finished topic
 * stays finished.
 */
export function canReview(state: TutorState, nodeId: string): boolean {
  return !!topicSchedule(state, nodeId);
}
