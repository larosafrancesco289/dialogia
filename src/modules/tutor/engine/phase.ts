// Module: tutor engine phase
// Responsibility: the session's phase and open card, derived from state and never stored apart from it.

import type { Awaiting, TutorPhase, TutorState } from '@/modules/tutor/engine/state';
import { quizFinished } from '@/modules/tutor/engine/state';

/**
 * intake (no plan, nothing proposed) -> proposal (a proposal is pending) ->
 * teaching (a topic is in progress) -> interlude (none in progress, some
 * remain) -> complete (every topic done). The interlude is a real stop:
 * completing a topic never starts the next one.
 */
export function derivePhase(state: Pick<TutorState, 'plan' | 'proposal'>): TutorPhase {
  if (state.proposal) return 'proposal';
  const plan = state.plan;
  if (!plan) return 'intake';
  if (plan.nodes.some((n) => n.status === 'in_progress')) return 'teaching';
  if (plan.nodes.every((n) => n.status === 'completed')) return 'complete';
  return 'interlude';
}

/** The most recently opened card that is still waiting on the learner. */
export function deriveAwaiting(
  state: Pick<TutorState, 'intakes' | 'diagnostics' | 'quizzes' | 'proposal'>,
): Awaiting | undefined {
  const open: Array<Awaiting & { seq: number }> = [];
  for (const intake of Object.values(state.intakes)) {
    if (!intake.responses && !intake.dismissed) {
      open.push({ kind: 'intake', id: intake.intakeId, seq: intake.seq });
    }
  }
  for (const diagnostic of Object.values(state.diagnostics)) {
    if (!diagnostic.answers && !diagnostic.dismissed) {
      open.push({ kind: 'diagnostic', id: diagnostic.diagnosticId, seq: diagnostic.seq });
    }
  }
  for (const quiz of Object.values(state.quizzes)) {
    if (!quizFinished(quiz) && !quiz.dismissed) {
      open.push({ kind: 'quiz', id: quiz.quizId, seq: quiz.seq });
    }
  }
  if (state.proposal) {
    open.push({ kind: 'proposal', id: state.proposal.proposalId, seq: state.proposal.seq });
  }
  if (!open.length) return undefined;
  const latest = open.reduce((a, b) => (b.seq > a.seq ? b : a));
  return { kind: latest.kind, id: latest.id };
}
