// Module: tutor ui messageViews
// Responsibility: what one assistant message's tutor surfaces show, read from the event log:
// its cards, and what its events changed (margin notes, a finished chapter).

import type { Evidence, LearningPlan, TopicMastery } from '@/lib/types';
import {
  apply,
  confidenceOf,
  effectiveEvents,
  emptyTutorState,
  type CompletionHow,
  type DiagnosticRecord,
  type IntakeRecord,
  type QuizRecord,
  type TutorEvent,
} from '@/modules/tutor/engine';
import type { TutorSession } from '@/modules/tutor/store/tutorSlice';
import { countWord, joinSentences, listInProse } from '@/modules/tutor/lib/text';

export type ProposalView = {
  proposalId: string;
  plan: LearningPlan;
  rationale?: string;
  /** It revises an approved plan. */
  revision: boolean;
  status: 'pending' | 'approved' | 'declined' | 'replaced';
};

export type IntakeView = IntakeRecord & { answeredAt?: number };

export type MessageCards = {
  intake?: IntakeView;
  diagnostic?: DiagnosticRecord;
  quiz?: QuizRecord;
  proposal?: ProposalView;
};

function latestFor<T extends { messageId?: string; seq: number }>(
  records: Record<string, T>,
  messageId: string,
): T | undefined {
  let found: T | undefined;
  for (const record of Object.values(records)) {
    if (record.messageId === messageId && (!found || record.seq > found.seq)) found = record;
  }
  return found;
}

/**
 * The message's proposal and what became of it. A later proposal replaces it
 * when it was still waiting, or answers it when the learner asked for changes:
 * either way the card then points at the revision below.
 */
function proposalFor(events: readonly TutorEvent[], messageId: string): ProposalView | undefined {
  let view: ProposalView | undefined;
  for (const event of events) {
    if (event.type === 'plan_proposed') {
      if (event.messageId === messageId) {
        view = {
          proposalId: event.proposalId,
          plan: event.plan,
          ...(event.rationale ? { rationale: event.rationale } : {}),
          revision: event.revision,
          status: 'pending',
        };
      } else if (view?.status === 'pending' || view?.status === 'declined') {
        view = { ...view, status: 'replaced' };
      }
    } else if (event.type === 'proposal_imported' && event.messageId === messageId) {
      view = {
        proposalId: event.proposalId,
        plan: event.plan,
        ...(event.rationale ? { rationale: event.rationale } : {}),
        revision: false,
        status: event.status,
      };
    } else if (view && event.type === 'plan_approved' && event.proposalId === view.proposalId) {
      view = { ...view, status: 'approved' };
    } else if (view && event.type === 'plan_declined' && event.proposalId === view.proposalId) {
      view = { ...view, status: 'declined' };
    }
  }
  return view;
}

/** The cards an assistant message put in front of the learner, as they stand now. */
export function cardsForMessage(session: TutorSession, messageId: string): MessageCards {
  const { state } = session;
  const events = effectiveEvents(session.events);
  const cards: MessageCards = {};
  const intake = latestFor(state.intakes, messageId);
  if (intake) {
    const answeredAt = intake.responses
      ? events.find((e) => e.type === 'intake_answered' && e.intakeId === intake.intakeId)?.at
      : undefined;
    cards.intake = { ...intake, ...(answeredAt ? { answeredAt } : {}) };
  }
  const diagnostic = latestFor(state.diagnostics, messageId);
  if (diagnostic) cards.diagnostic = diagnostic;
  const quiz = latestFor(state.quizzes, messageId);
  if (quiz) cards.quiz = quiz;
  const proposal = proposalFor(events, messageId);
  if (proposal) cards.proposal = proposal;
  return cards;
}

/** One topic's movement from a message's evidence, with the notes that moved it. */
export type MasteryChange = { nodeId: string; from: number; to: number; notes: string[] };

/**
 * The changes a message's margin notes show: every topic whose estimate it
 * moved, the topic it finished included. The chapter break states where that
 * topic stands; the note says what the exchange changed and why, and is
 * where the learner answers it.
 */
export function marginChanges(effects: MessageEffects): MasteryChange[] {
  return effects.masteryChanges.filter((change) => change.from !== change.to);
}

/** A margin note's reasons folded to this many (the latest); the rest wait behind "+N more". */
const REASONS_SHOWN = 2;

/**
 * The reason a margin note gives: every note that moved the estimate, as
 * sentences, or (folded) the latest two and how many more there are. Nothing
 * is ever dropped silently.
 */
export function marginReason(notes: string[], unfolded: boolean): { text: string; more: number } {
  const clean = notes.map((note) => note.trim()).filter(Boolean);
  const shown = unfolded ? clean : clean.slice(-REASONS_SHOWN);
  return { text: joinSentences(...shown), more: clean.length - shown.length };
}

/** A topic the message's events completed, and what the learner made of it at that seam. */
export type Completion = {
  nodeId: string;
  how: CompletionHow;
  /**
   * The topic's estimate and evidence at the seam: as it stands while the seam
   * is open (a correction there shows at once), and as it stood when the
   * learner went on, not today's.
   */
  mastery?: TopicMastery;
  /** The topic started after this one, once one has been. */
  nextNodeId?: string;
  /** The learner took this topic up again before anything else started. */
  reopened?: boolean;
};

export type MessageEffects = { masteryChanges: MasteryChange[]; completed?: Completion };

const effectsCache = new WeakMap<readonly TutorEvent[], Map<string, MessageEffects>>();

/**
 * Per message, what its events did: each topic's estimate before and after
 * (with the notes that moved it), and the topic it finished, with what the
 * learner did next at that seam: the first topic started or reopened after
 * it, and the estimate they decided on. What happens to the topic later is
 * not that seam's to show. One replay of the (retraction-aware) log per log,
 * shared by every message.
 */
export function effectsByMessage(events: readonly TutorEvent[]): Map<string, MessageEffects> {
  const cached = effectsCache.get(events);
  if (cached) return cached;
  const out = new Map<string, MessageEffects>();
  let state = emptyTutorState();
  let awaitingNext: Completion | undefined;
  for (const event of effectiveEvents(events)) {
    const before = state;
    state = apply(state, event);
    if (awaitingNext && (event.type === 'topic_started' || event.type === 'topic_reopened')) {
      if (event.type === 'topic_reopened' && event.nodeId === awaitingNext.nodeId) {
        awaitingNext.reopened = true;
      } else {
        awaitingNext.nextNodeId = event.nodeId;
      }
      awaitingNext.mastery = before.mastery[awaitingNext.nodeId];
      awaitingNext = undefined;
    }
    const messageId = event.messageId;
    if (!messageId) continue;
    if (event.type === 'evidence_recorded') {
      const entry = out.get(messageId) ?? { masteryChanges: [] };
      const change = entry.masteryChanges.find((c) => c.nodeId === event.nodeId);
      const to = confidenceOf(state, event.nodeId);
      if (change) {
        change.to = to;
        change.notes.push(event.note);
      } else {
        entry.masteryChanges.push({
          nodeId: event.nodeId,
          from: confidenceOf(before, event.nodeId),
          to,
          notes: [event.note],
        });
      }
      out.set(messageId, entry);
    } else if (event.type === 'topic_completed') {
      const entry = out.get(messageId) ?? { masteryChanges: [] };
      if (awaitingNext) awaitingNext.mastery = before.mastery[awaitingNext.nodeId];
      awaitingNext = { nodeId: event.nodeId, how: event.how };
      entry.completed = awaitingNext;
      out.set(messageId, entry);
    }
  }
  // Still open: the break asks about the estimate as it is now.
  if (awaitingNext) awaitingNext.mastery = state.mastery[awaitingNext.nodeId];
  effectsCache.set(events, out);
  return out;
}

// Legacy entries carry no source; these types were the learner's own work.
const LEGACY_ANSWERS = new Set<Evidence['type']>([
  'correct_answer',
  'incorrect_answer',
  'partial_answer',
  'insight_demonstrated',
]);

type EvidenceGroup =
  | 'answer'
  | 'observation'
  | 'said'
  | 'correction'
  | 'practice'
  | 'estimate'
  | 'earlier';

const GROUP_WORDS: Record<EvidenceGroup, (n: number) => string> = {
  answer: (n) => `${countWord(n)} answer${n === 1 ? '' : 's'}`,
  observation: (n) => `${countWord(n)} observation${n === 1 ? '' : 's'}`,
  said: (n) =>
    n === 1 ? 'something you told the tutor' : `${countWord(n)} things you told the tutor`,
  correction: (n) => (n === 1 ? 'your correction' : `${countWord(n)} corrections of yours`),
  practice: (n) =>
    n === 1 ? 'your request for more practice' : `${countWord(n)} requests for more practice`,
  estimate: (n) => (n === 1 ? 'a starting estimate' : `${countWord(n)} starting estimates`),
  earlier: (n) => `${countWord(n)} earlier note${n === 1 ? '' : 's'}`,
};

function groupOf(entry: Evidence): EvidenceGroup {
  if (entry.kind === 'placement' || entry.source === 'placement') return 'estimate';
  // Older logs: asking for more practice used to cap the estimate. It corrected nothing.
  if (entry.kind === 'more_practice') return 'practice';
  switch (entry.source) {
    case 'quiz':
    case 'diagnostic':
      return 'answer';
    case 'observation':
      return 'observation';
    case 'learner_said':
      return 'said';
    case 'learner':
      return 'correction';
    default:
      return LEGACY_ANSWERS.has(entry.type) ? 'answer' : 'earlier';
  }
}

/**
 * Everything a topic's estimate rests on, in words: "one answer, two
 * observations and a starting estimate". Every piece counts, whatever its
 * source, so the sentence never claims less than stands behind the number.
 */
export function evidenceBehind(evidence: readonly Evidence[]): string | undefined {
  const counts = new Map<EvidenceGroup, number>();
  for (const entry of evidence) {
    const group = groupOf(entry);
    counts.set(group, (counts.get(group) ?? 0) + 1);
  }
  const order: EvidenceGroup[] = [
    'answer',
    'observation',
    'said',
    'correction',
    'practice',
    'earlier',
    'estimate',
  ];
  const parts = order.filter((g) => counts.has(g)).map((g) => GROUP_WORDS[g](counts.get(g)!));
  return parts.length ? listInProse(parts) : undefined;
}
