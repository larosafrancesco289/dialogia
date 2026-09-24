// Module: tutor engine fold
// Responsibility: the reducer. State is always `fold(events)`; nothing else writes it.

import type { Evidence, LearningPlan, LearningPlanNode, TopicMastery } from '@/lib/types';
import type { TutorEvent, TutorEventOf } from '@/modules/tutor/engine/events';
import { deriveAwaiting, derivePhase } from '@/modules/tutor/engine/phase';
import {
  applyEvidence,
  clamp01,
  clampWeight,
  legacyEvidenceType,
} from '@/modules/tutor/engine/rules';
import { emptyTutorState, freshMastery, type TutorState } from '@/modules/tutor/engine/state';

export function fold(events: readonly TutorEvent[]): TutorState {
  return [...events].sort((a, b) => a.seq - b.seq).reduce(apply, emptyTutorState());
}

/** Pure: returns a new state and never mutates its inputs. */
export function apply(state: TutorState, event: TutorEvent): TutorState {
  const next = reduce({ ...state, lastSeq: Math.max(state.lastSeq, event.seq) }, event);
  const currentNodeId = next.plan?.nodes.find((n) => n.status === 'in_progress')?.id;
  return {
    ...next,
    currentNodeId,
    phase: derivePhase(next),
    awaiting: deriveAwaiting(next),
  };
}

function reduce(state: TutorState, event: TutorEvent): TutorState {
  switch (event.type) {
    case 'legacy_imported':
      return importLegacy(state, event);

    case 'intake_asked':
      return {
        ...state,
        intakes: {
          ...state.intakes,
          [event.intakeId]: {
            intakeId: event.intakeId,
            title: event.title,
            questions: event.questions,
            seq: event.seq,
            messageId: event.messageId,
          },
        },
      };

    case 'intake_answered': {
      const intake = state.intakes[event.intakeId];
      if (!intake) return state;
      return {
        ...state,
        intakes: { ...state.intakes, [event.intakeId]: { ...intake, responses: event.responses } },
      };
    }

    case 'diagnostic_given':
      return {
        ...state,
        diagnostics: {
          ...state.diagnostics,
          [event.diagnosticId]: {
            diagnosticId: event.diagnosticId,
            topic: event.topic,
            items: event.items,
            seq: event.seq,
            messageId: event.messageId,
          },
        },
        counts: { ...state.counts, diagnostics: state.counts.diagnostics + 1 },
      };

    case 'diagnostic_answered': {
      const diagnostic = state.diagnostics[event.diagnosticId];
      if (!diagnostic) return state;
      return {
        ...state,
        diagnostics: {
          ...state.diagnostics,
          [event.diagnosticId]: { ...diagnostic, answers: event.answers },
        },
      };
    }

    case 'plan_proposed':
      return {
        ...state,
        proposal: {
          proposalId: event.proposalId,
          plan: event.plan,
          rationale: event.rationale,
          revision: event.revision,
          seq: event.seq,
          messageId: event.messageId,
        },
        lastDeclined: undefined,
      };

    case 'plan_approved':
      return approve(state, event);

    case 'plan_declined':
      if (state.proposal?.proposalId !== event.proposalId) return state;
      return {
        ...state,
        proposal: undefined,
        lastDeclined: { proposalId: event.proposalId, feedback: event.feedback },
      };

    case 'topic_started':
      return withNodes(state, (node) => {
        if (node.id === event.nodeId) {
          return { ...node, status: 'in_progress', startedAt: node.startedAt ?? event.at };
        }
        return node.status === 'in_progress' ? { ...node, status: 'not_started' } : node;
      });

    case 'topic_completed':
      return withNodes(state, (node) =>
        node.id === event.nodeId
          ? { ...node, status: 'completed', completedAt: event.at, completedHow: event.how }
          : node,
      );

    case 'topic_reopened': {
      const reopened = withNodes(state, (node) => {
        if (node.id === event.nodeId) {
          const { completedAt: _at, completedHow: _how, ...rest } = node;
          return { ...rest, status: 'in_progress' };
        }
        return node.status === 'in_progress' ? { ...node, status: 'not_started' } : node;
      });
      return {
        ...reopened,
        counts: {
          ...reopened.counts,
          quizzesByNode: { ...reopened.counts.quizzesByNode, [event.nodeId]: 0 },
        },
      };
    }

    case 'quiz_given':
      return {
        ...state,
        quizzes: {
          ...state.quizzes,
          [event.quizId]: {
            quizId: event.quizId,
            nodeId: event.nodeId,
            title: event.title,
            items: event.items,
            answers: {},
            seq: event.seq,
            messageId: event.messageId,
          },
        },
        counts: {
          ...state.counts,
          quizzesByNode: {
            ...state.counts.quizzesByNode,
            [event.nodeId]: (state.counts.quizzesByNode[event.nodeId] ?? 0) + 1,
          },
        },
      };

    case 'quiz_answered': {
      const quiz = state.quizzes[event.quizId];
      if (!quiz || quiz.answers[event.itemId]) return state;
      return {
        ...state,
        quizzes: {
          ...state.quizzes,
          [event.quizId]: {
            ...quiz,
            answers: {
              ...quiz.answers,
              [event.itemId]: { choice: event.choice, correct: event.correct },
            },
          },
        },
      };
    }

    case 'evidence_recorded':
      return withMastery(state, event.nodeId, (topic) => {
        const weight = typeof event.weight === 'number' ? clampWeight(event.weight) : undefined;
        const setTo = typeof event.setTo === 'number' ? clamp01(event.setTo) : undefined;
        const entry: Evidence = {
          timestamp: event.at,
          type: legacyEvidenceType(event.kind),
          details: event.note,
          weight: weight ?? 0,
          ...(setTo != null ? { setTo } : {}),
          eventId: event.id,
          source: event.source,
          kind: event.kind,
          ...(event.ref ? { ref: event.ref } : {}),
        };
        return {
          ...topic,
          confidence: applyEvidence(topic.confidence, { weight, setTo }),
          evidence: [...topic.evidence, entry],
          interactions: topic.interactions + (event.source === 'learner' ? 0 : 1),
          lastInteraction: event.at,
        };
      });

    case 'misconception_noted':
      return withMastery(state, event.nodeId, (topic) => {
        const existing = topic.misconceptions.find((m) => m.id === event.misconceptionId);
        const misconceptions = existing
          ? topic.misconceptions.map((m) =>
              m.id === event.misconceptionId
                ? {
                    ...m,
                    occurrences: m.occurrences + 1,
                    resolved: false,
                    resolvedBy: undefined,
                  }
                : m,
            )
          : [
              ...topic.misconceptions,
              {
                id: event.misconceptionId,
                description: event.description,
                firstObserved: event.at,
                occurrences: 1,
                resolved: false,
              },
            ];
        return { ...topic, misconceptions, lastInteraction: event.at };
      });

    case 'misconception_resolved':
      return withMastery(state, event.nodeId, (topic) => ({
        ...topic,
        misconceptions: topic.misconceptions.map((m) =>
          m.id === event.misconceptionId
            ? { ...m, resolved: true, resolvedBy: event.by === 'learner' ? 'learner' : 'tutor' }
            : m,
        ),
      }));

    case 'review_flagged':
      return withMastery(state, event.nodeId, (topic) => ({
        ...topic,
        needsReview: event.flagged,
      }));

    case 'card_dismissed': {
      if (event.card === 'intake') {
        const intake = state.intakes[event.cardId];
        if (!intake) return state;
        return {
          ...state,
          intakes: { ...state.intakes, [event.cardId]: { ...intake, dismissed: true } },
        };
      }
      if (event.card === 'diagnostic') {
        const diagnostic = state.diagnostics[event.cardId];
        if (!diagnostic) return state;
        return {
          ...state,
          diagnostics: {
            ...state.diagnostics,
            [event.cardId]: { ...diagnostic, dismissed: true },
          },
        };
      }
      const quiz = state.quizzes[event.cardId];
      if (!quiz) return state;
      return {
        ...state,
        quizzes: { ...state.quizzes, [event.cardId]: { ...quiz, dismissed: true } },
      };
    }
  }
}

function withNodes(
  state: TutorState,
  update: (node: LearningPlanNode) => LearningPlanNode,
): TutorState {
  if (!state.plan) return state;
  return { ...state, plan: { ...state.plan, nodes: state.plan.nodes.map(update) } };
}

/** Evidence for a topic outside the approved plan has nowhere to go and is ignored. */
function withMastery(
  state: TutorState,
  nodeId: string,
  update: (topic: TopicMastery) => TopicMastery,
): TutorState {
  const topic = state.mastery[nodeId];
  if (!topic) return state;
  return { ...state, mastery: { ...state.mastery, [nodeId]: update(topic) } };
}

/**
 * Surviving ids keep their status and mastery; new ids start fresh; removed
 * ids drop out. Statuses are read from the plan at approval time, not from
 * the proposal, so a topic finished while the proposal waited stays finished.
 */
function approve(state: TutorState, event: TutorEventOf<'plan_approved'>): TutorState {
  const proposal = state.proposal;
  if (!proposal || proposal.proposalId !== event.proposalId) return state;
  const previous = state.plan;
  const nodes = proposal.plan.nodes.map((node): LearningPlanNode => {
    const { status: _s, startedAt: _st, completedAt: _c, completedHow: _h, ...rest } = node;
    const old = previous?.nodes.find((n) => n.id === node.id);
    if (!old) return { ...rest, status: 'not_started' };
    return {
      ...rest,
      status: old.status,
      ...(old.startedAt != null ? { startedAt: old.startedAt } : {}),
      ...(old.completedAt != null ? { completedAt: old.completedAt } : {}),
      ...(old.completedHow ? { completedHow: old.completedHow } : {}),
    };
  });
  const plan: LearningPlan = {
    ...proposal.plan,
    generatedAt: previous?.generatedAt ?? event.at,
    updatedAt: event.at,
    nodes,
  };
  const mastery: Record<string, TopicMastery> = {};
  for (const node of nodes) {
    mastery[node.id] = state.mastery[node.id] ?? freshMastery(node.id, event.at);
  }
  return { ...state, plan, mastery, proposal: undefined, lastDeclined: undefined };
}

function importLegacy(state: TutorState, event: TutorEventOf<'legacy_imported'>): TutorState {
  let next = state;
  if (event.plan) {
    let seenInProgress = false;
    const nodes = event.plan.nodes.map((node): LearningPlanNode => {
      if (node.status !== 'in_progress') return node;
      if (seenInProgress) return { ...node, status: 'not_started' };
      seenInProgress = true;
      return node;
    });
    const plan = { ...event.plan, nodes };
    const mastery: Record<string, TopicMastery> = {};
    for (const node of nodes) {
      const legacy = event.learnerModel?.mastery[node.id];
      mastery[node.id] = legacy
        ? { ...legacy, nodeId: node.id, baseline: clamp01(legacy.confidence) }
        : freshMastery(node.id, event.at);
    }
    next = { ...next, plan, mastery };
  }
  if (event.proposal) {
    next = {
      ...next,
      proposal: {
        proposalId: event.proposal.proposalId,
        plan: event.proposal.plan,
        rationale: event.proposal.rationale,
        revision: !!event.plan,
        seq: event.seq,
        messageId: event.messageId,
      },
    };
  }
  return next;
}
