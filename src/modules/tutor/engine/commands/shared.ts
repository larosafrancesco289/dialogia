// Module: tutor engine command helpers
// Responsibility: what the gate and both halves of `decide` share: the event emitter, errors and phase hints, topic lookup, argument cleanup, and the two commands both sides can issue (start a topic, resolve a misconception).

import type { LearningPlan, LearningPlanNode } from '@/lib/types';
import type { TutorEvent, TutorEventDraft } from '@/modules/tutor/engine/events';
import { findPlanNode, readyNodes, unmetPrerequisites } from '@/modules/tutor/engine/plan';
import { openMisconceptions, type TutorPhase, type TutorState } from '@/modules/tutor/engine/state';
import type {
  CommandContext,
  TutorError,
  TutorErrorCode,
} from '@/modules/tutor/engine/commands/types';

export class Emitter {
  readonly events: TutorEvent[] = [];

  constructor(
    private readonly state: TutorState,
    private readonly ctx: CommandContext,
    private readonly by: 'tutor' | 'learner',
  ) {}

  push(draft: TutorEventDraft, by: 'tutor' | 'learner' | 'system' = this.by): TutorEvent {
    const event = {
      ...draft,
      id: this.ctx.idFactory(),
      chatId: this.ctx.chatId,
      seq: this.state.lastSeq + this.events.length + 1,
      at: this.ctx.at,
      by,
      ...(this.ctx.messageId ? { messageId: this.ctx.messageId } : {}),
    } as TutorEvent;
    this.events.push(event);
    return event;
  }
}

export const err = (code: TutorErrorCode, message: string, hint: string): TutorError => ({
  code,
  message,
  hint,
});

export const PHASE_HINT: Record<TutorPhase, string> = {
  intake:
    'There is no plan yet. Learn the goal and prior knowledge (ask_intake, give_diagnostic), then call propose_plan.',
  proposal:
    'A plan proposal is waiting for the learner. Answer their questions, or call propose_plan again to revise it.',
  teaching:
    'A topic is in progress. Teach it, check understanding with give_quiz, record_evidence as you observe, and call complete_topic when it is mastered.',
  interlude:
    'A topic just finished and the learner is choosing what comes next. Call start_topic when they ask to go on.',
  complete:
    'Every topic is done. Offer review, or call propose_plan to extend or replace the plan.',
};

function validIds(plan: LearningPlan): string {
  return `Set topicId to one of the valid topic ids: ${plan.nodes.map((n) => n.id).join(', ')}.`;
}

type NodeLookup =
  | { node: LearningPlanNode; error?: undefined }
  | { node?: undefined; error: TutorError };

export function resolveNode(
  state: TutorState,
  ref: string | undefined,
  useCurrent: boolean,
): NodeLookup {
  const plan = state.plan;
  if (!plan) {
    return { error: err('no_plan', 'There is no approved plan yet.', PHASE_HINT[state.phase]) };
  }
  const trimmed = ref?.trim();
  if (!trimmed) {
    const current = useCurrent ? plan.nodes.find((n) => n.id === state.currentNodeId) : undefined;
    if (current) return { node: current };
    return {
      error: err(
        'no_current_topic',
        useCurrent ? 'No topic is in progress, so a topic id is needed.' : 'A topic id is needed.',
        validIds(plan),
      ),
    };
  }
  const node = findPlanNode(plan, trimmed);
  if (!node) {
    return {
      error: err('unknown_node', `There is no topic "${trimmed}" in the plan.`, validIds(plan)),
    };
  }
  return { node };
}

export function invalid(message: string, hint = 'Fix the arguments and call again.'): TutorError {
  return err('invalid_arguments', message, hint);
}

export function text(value: string | undefined): string {
  return (value ?? '').trim();
}

export function shorten(value: string, max = 80): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
}

export function startTopic(
  state: TutorState,
  ref: string,
  by: 'tutor' | 'learner',
  out: Emitter,
): TutorError | null {
  const found = resolveNode(state, ref, false);
  if (found.error) return found.error;
  const node = found.node;
  const plan = state.plan as LearningPlan;
  if (node.status === 'completed') {
    return err(
      'topic_completed',
      `${node.name} is already completed.`,
      by === 'learner'
        ? 'Reopen it for more practice instead.'
        : 'A completed topic comes back only when the learner reopens it.',
    );
  }
  if (node.id === state.currentNodeId) {
    // The tutor wants the topic in progress, and it is: nothing to refuse.
    if (by === 'tutor') return null;
    return err('already_current', `${node.name} is already in progress.`, 'Carry on teaching it.');
  }
  const unmet = unmetPrerequisites(plan, node);
  if (unmet.length) {
    const ready = readyNodes(plan).map((n) => n.id);
    return err(
      'prerequisites_unmet',
      `${node.name} needs ${unmet.map((n) => `${n.name} [${n.id}]`).join(', ')} first.`,
      ready.length ? `Ready to start now: ${ready.join(', ')}.` : PHASE_HINT[state.phase],
    );
  }
  out.push({ type: 'topic_started', nodeId: node.id });
  return null;
}

export function resolveMisconception(
  state: TutorState,
  cmd: { nodeId?: string; misconceptionId: string; note?: string },
  by: 'tutor' | 'learner',
  out: Emitter,
): TutorError | null {
  if (!state.plan) return resolveNode(state, cmd.nodeId, false).error ?? null;
  const wanted = text(cmd.misconceptionId);
  const everywhere = state.plan.nodes.map((n) => n.id);
  // The misconception id is the key; a topic id only narrows the search, and
  // one that does not hold the misconception is ignored rather than refused.
  const named = text(cmd.nodeId) ? resolveNode(state, cmd.nodeId, false).node?.id : undefined;
  const holds = (id: string) => !!state.mastery[id]?.misconceptions.some((m) => m.id === wanted);
  const nodeIds = named && holds(named) ? [named] : everywhere;
  for (const nodeId of nodeIds) {
    const hit = state.mastery[nodeId]?.misconceptions.find((m) => m.id === wanted);
    if (!hit) continue;
    if (hit.resolved) {
      if (by === 'tutor') return null;
      return err(
        'already_resolved',
        `Misconception "${wanted}" is already resolved.`,
        'Nothing to do; note it again if it comes back.',
      );
    }
    out.push({
      type: 'misconception_resolved',
      nodeId,
      misconceptionId: hit.id,
      ...(text(cmd.note) ? { note: text(cmd.note) } : {}),
    });
    return null;
  }
  const open = nodeIds.flatMap((id) => openMisconceptions(state, id).map((m) => `${m.id} (${id})`));
  return err(
    'unknown_misconception',
    `There is no misconception "${wanted}".`,
    open.length
      ? `Set misconceptionId to one of the open misconceptions: ${open.join(', ')}.`
      : 'There are no open misconceptions; stop calling resolve_misconception.',
  );
}
