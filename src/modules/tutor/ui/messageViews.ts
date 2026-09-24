// Module: tutor ui messageViews
// Responsibility: what one assistant message's tutor surfaces show, read from the event log:
// its cards, and what its turn changed (margin notes, a finished chapter).
// B2: the transcript redesign replaces these adapters with event-native components.

import type { LearningPlan } from '@/lib/types';
import {
  apply,
  confidenceOf,
  emptyTutorState,
  type CompletionHow,
  type DiagnosticRecord,
  type IntakeRecord,
  type QuizRecord,
  type TutorEvent,
} from '@/modules/tutor/engine';
import type { TutorSession } from '@/modules/tutor/store/tutorSlice';

export type ProposalView = {
  proposalId: string;
  plan: LearningPlan;
  rationale?: string;
  status: 'pending' | 'approved' | 'declined' | 'replaced';
};

export type MessageCards = {
  intake?: IntakeRecord & { answeredAt?: number };
  diagnostic?: DiagnosticRecord;
  quiz?: QuizRecord;
  proposal?: ProposalView;
};

export type MasteryChange = { nodeId: string; from: number; to: number; notes: string[] };

export type MessageEffects = {
  masteryChanges: MasteryChange[];
  completed?: { nodeId: string; how: CompletionHow };
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

function proposalFor(session: TutorSession, messageId: string): ProposalView | undefined {
  const pending = session.state.proposal;
  if (pending?.messageId === messageId) {
    return {
      proposalId: pending.proposalId,
      plan: pending.plan,
      ...(pending.rationale ? { rationale: pending.rationale } : {}),
      status: 'pending',
    };
  }
  let view: ProposalView | undefined;
  for (const event of session.events) {
    if (event.type === 'plan_proposed' && event.messageId === messageId) {
      view = {
        proposalId: event.proposalId,
        plan: event.plan,
        ...(event.rationale ? { rationale: event.rationale } : {}),
        status: 'replaced',
      };
    } else if (
      event.type === 'legacy_imported' &&
      event.proposal &&
      event.messageId === messageId
    ) {
      view = { ...event.proposal, status: 'replaced' };
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
  const intake = latestFor(state.intakes, messageId);
  const answered = intake?.responses
    ? session.events.find((e) => e.type === 'intake_answered' && e.intakeId === intake.intakeId)?.at
    : undefined;
  const cards: MessageCards = {};
  if (intake) cards.intake = { ...intake, ...(answered ? { answeredAt: answered } : {}) };
  const diagnostic = latestFor(state.diagnostics, messageId);
  if (diagnostic) cards.diagnostic = diagnostic;
  const quiz = latestFor(state.quizzes, messageId);
  if (quiz) cards.quiz = quiz;
  const proposal = proposalFor(session, messageId);
  if (proposal) cards.proposal = proposal;
  return cards;
}

const effectsCache = new WeakMap<readonly TutorEvent[], Map<string, MessageEffects>>();

/**
 * Per message, what its events moved: each topic's estimate before and after
 * (with the notes that moved it) and the topic it finished, if any. One replay
 * of the log per log, shared by every message.
 */
export function effectsByMessage(events: readonly TutorEvent[]): Map<string, MessageEffects> {
  const cached = effectsCache.get(events);
  if (cached) return cached;
  const out = new Map<string, MessageEffects>();
  let state = emptyTutorState();
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    const before = state;
    state = apply(state, event);
    const messageId = event.messageId;
    if (!messageId) continue;
    const entry = out.get(messageId) ?? { masteryChanges: [] };
    if (event.type === 'evidence_recorded') {
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
    } else if (event.type === 'topic_completed') {
      entry.completed = { nodeId: event.nodeId, how: event.how };
    }
    out.set(messageId, entry);
  }
  effectsCache.set(events, out);
  return out;
}
