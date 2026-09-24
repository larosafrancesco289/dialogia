// Module: tutor engine commands
// Responsibility: `decide`, the only place a tutor rule or precondition is checked. Commands in, events or a structured error out.

import type { LearningPlan, LearningPlanNode } from '@/lib/types';
import type {
  CardKind,
  DiagnosticItem,
  StartingEstimate,
  IntakeOption,
  IntakeQuestion,
  QuizItem,
  TutorEvent,
  TutorEventDraft,
} from '@/modules/tutor/engine/events';
import type { TutorFlags } from '@/modules/tutor/engine/flags';
import { apply } from '@/modules/tutor/engine/fold';
import {
  buildPlan,
  findPlanNode,
  nextReadyNode,
  readyNodes,
  slugify,
  uniqueId,
  unmetPrerequisites,
  type PlanInput,
} from '@/modules/tutor/engine/plan';
import {
  LIMITS,
  OBSERVATION_KINDS,
  OBSERVATION_SIGN,
  HELPED_FACTOR,
  OBSERVATION_WEIGHTS,
  READY,
  STARTING_ESTIMATE_MAX,
  WEIGHT_MAX,
  WEIGHT_MIN,
  clamp01,
  clampWeight,
  diagnosticWeight,
  markKnownTarget,
  morePracticeTarget,
  percent,
  quizWeight,
  type ObservationKind,
} from '@/modules/tutor/engine/rules';
import {
  confidenceOf,
  openMisconceptions,
  quizFinished,
  remainingBudgets,
  type TutorPhase,
  type TutorState,
} from '@/modules/tutor/engine/state';

export type TutorErrorCode =
  | 'invalid_arguments'
  | 'wrong_phase'
  | 'card_open'
  | 'budget_exhausted'
  | 'not_editable'
  | 'no_plan'
  | 'invalid_plan'
  | 'no_proposal'
  | 'stale_proposal'
  | 'unknown_node'
  | 'no_current_topic'
  | 'topic_not_current'
  | 'topic_completed'
  | 'topic_not_completed'
  | 'already_current'
  | 'prerequisites_unmet'
  | 'not_ready'
  | 'open_misconceptions'
  | 'unknown_misconception'
  | 'already_resolved'
  | 'unknown_card'
  | 'unknown_item'
  | 'card_closed'
  | 'already_answered'
  | 'incomplete_answers'
  | 'invalid_choice'
  | 'nothing_to_change'
  | 'unknown_tool';

export type TutorError = { code: TutorErrorCode; message: string; hint: string };

export type IntakeQuestionInput = Omit<IntakeQuestion, 'id'>;
export type QuizItemInput = Omit<QuizItem, 'id'>;
export type DiagnosticItemInput = QuizItemInput & { nodeId?: string };

export type TutorToolCommand =
  | { by: 'tutor'; type: 'ask_intake'; title?: string; questions: IntakeQuestionInput[] }
  | { by: 'tutor'; type: 'give_diagnostic'; topic: string; items: DiagnosticItemInput[] }
  | ({ by: 'tutor'; type: 'propose_plan'; rationale?: string } & PlanInput)
  | { by: 'tutor'; type: 'give_quiz'; title?: string; items: QuizItemInput[] }
  | {
      by: 'tutor';
      type: 'record_evidence';
      nodeId?: string;
      source: 'observation' | 'learner_said';
      kind: ObservationKind;
      weight?: number;
      /** The tutor led them to it; an upward weight counts for less. */
      helped?: boolean;
      setTo?: number;
      note: string;
    }
  | { by: 'tutor'; type: 'note_misconception'; nodeId?: string; description: string }
  | {
      by: 'tutor';
      type: 'resolve_misconception';
      nodeId?: string;
      misconceptionId: string;
      note?: string;
    }
  | {
      by: 'tutor';
      type: 'complete_topic';
      nodeId?: string;
      how: 'mastered' | 'skipped';
      note?: string;
    }
  | { by: 'tutor'; type: 'start_topic'; nodeId: string };

export type LearnerCommand =
  | { by: 'learner'; type: 'answer_intake'; intakeId: string; responses: Record<string, string[]> }
  | {
      by: 'learner';
      type: 'answer_diagnostic';
      diagnosticId: string;
      answers: Record<string, number>;
    }
  | { by: 'learner'; type: 'answer_quiz_item'; quizId: string; itemId: string; choice: number }
  | { by: 'learner'; type: 'approve_plan'; proposalId: string }
  | { by: 'learner'; type: 'decline_plan'; proposalId: string; feedback?: string }
  | { by: 'learner'; type: 'start_topic'; nodeId: string }
  | { by: 'learner'; type: 'mark_known'; nodeId: string }
  | { by: 'learner'; type: 'skip_topic'; nodeId: string }
  | { by: 'learner'; type: 'reopen_topic'; nodeId: string }
  | { by: 'learner'; type: 'more_practice'; nodeId: string }
  | { by: 'learner'; type: 'adjust_mastery'; nodeId: string; setTo: number; note?: string }
  | { by: 'learner'; type: 'resolve_misconception'; nodeId?: string; misconceptionId: string }
  | { by: 'learner'; type: 'flag_review'; nodeId: string; flagged: boolean }
  | { by: 'learner'; type: 'dismiss_card'; card: CardKind; cardId: string };

export type TutorCommand = TutorToolCommand | LearnerCommand;

export type TutorToolName = TutorToolCommand['type'];

export type CommandContext = {
  chatId: string;
  at: number;
  idFactory: () => string;
  flags: TutorFlags;
  /** The assistant message the resulting events belong to. */
  messageId?: string;
};

export type DecideResult = { ok: true; events: TutorEvent[] } | { ok: false; error: TutorError };

export type StepResult =
  | { ok: true; events: TutorEvent[]; state: TutorState }
  | { ok: false; error: TutorError };

export function decide(
  state: TutorState,
  command: TutorCommand,
  ctx: CommandContext,
): DecideResult {
  const out = new Emitter(state, ctx, command.by);
  const error =
    command.by === 'tutor'
      ? decideTutor(state, command, ctx, out)
      : decideLearner(state, command, ctx, out);
  return error ? { ok: false, error } : { ok: true, events: out.events };
}

/** `decide`, then fold the new events in. */
export function step(state: TutorState, command: TutorCommand, ctx: CommandContext): StepResult {
  const result = decide(state, command, ctx);
  if (!result.ok) return result;
  return { ok: true, events: result.events, state: result.events.reduce(apply, state) };
}

class Emitter {
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

const err = (code: TutorErrorCode, message: string, hint: string): TutorError => ({
  code,
  message,
  hint,
});

// ---------------------------------------------------------------- gating

const TOOL_PHASES: Record<TutorToolName, TutorPhase[]> = {
  ask_intake: ['intake'],
  give_diagnostic: ['intake', 'proposal', 'interlude'],
  propose_plan: ['intake', 'proposal', 'teaching', 'interlude', 'complete'],
  give_quiz: ['teaching'],
  record_evidence: ['teaching', 'interlude'],
  note_misconception: ['teaching'],
  resolve_misconception: ['teaching'],
  complete_topic: ['teaching'],
  start_topic: ['teaching', 'interlude'],
};

const CARD_TOOLS = new Set<TutorToolName>([
  'ask_intake',
  'give_diagnostic',
  'give_quiz',
  'propose_plan',
]);

const PHASE_HINT: Record<TutorPhase, string> = {
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

/**
 * Whether a tutor tool may be called in this state at all, before its
 * arguments are looked at. `tools.ts` offers exactly the tools this allows.
 */
export function gateTutorTool(
  state: TutorState,
  flags: TutorFlags,
  tool: TutorToolName,
): TutorError | null {
  const phase = state.phase;
  if (!TOOL_PHASES[tool].includes(phase)) {
    return err('wrong_phase', `${tool} is not available in the ${phase} phase.`, PHASE_HINT[phase]);
  }
  const open = state.awaiting;
  if (CARD_TOOLS.has(tool) && open && open.kind !== 'proposal') {
    return err(
      'card_open',
      `The learner has not finished the ${open.kind} you gave them.`,
      'Wait for their answers, or talk it through in chat. Another card can follow once this one is answered or closed.',
    );
  }
  if (phase === 'teaching' && tool === 'propose_plan' && !flags.planEditable) {
    return err(
      'not_editable',
      'The plan cannot be revised mid-topic in this session.',
      'Finish the current topic first; you may propose a revision at the chapter break.',
    );
  }
  if (phase === 'teaching' && tool === 'start_topic' && !flags.planEditable) {
    return err(
      'not_editable',
      'Topics cannot be switched mid-topic in this session.',
      'Finish the current topic with complete_topic first.',
    );
  }
  const budgets = remainingBudgets(state);
  if (tool === 'give_quiz' && budgets.quizzesLeft === 0) {
    return err(
      'budget_exhausted',
      'No quizzes left for this topic.',
      'Check understanding in conversation and use record_evidence instead.',
    );
  }
  if (tool === 'give_diagnostic' && budgets.diagnosticsLeft === 0) {
    return err(
      'budget_exhausted',
      'No diagnostics left in this session.',
      'Ask about prior knowledge in conversation instead.',
    );
  }
  return null;
}

// ---------------------------------------------------------------- helpers

function validIds(plan: LearningPlan): string {
  return `Set topicId to one of the valid topic ids: ${plan.nodes.map((n) => n.id).join(', ')}.`;
}

type NodeLookup =
  | { node: LearningPlanNode; error?: undefined }
  | { node?: undefined; error: TutorError };

function resolveNode(state: TutorState, ref: string | undefined, useCurrent: boolean): NodeLookup {
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

function invalid(message: string, hint = 'Fix the arguments and call again.'): TutorError {
  return err('invalid_arguments', message, hint);
}

function text(value: string | undefined): string {
  return (value ?? '').trim();
}

function checkCount(label: string, count: number, limits: { min: number; max: number }) {
  if (count < limits.min || count > limits.max) {
    return invalid(`${label}: ${limits.min} to ${limits.max} expected, got ${count}.`);
  }
  return null;
}

function checkChoiceItems(
  items: Array<{ question: string; choices: string[]; correct: number }>,
): TutorError | null {
  for (const [i, item] of items.entries()) {
    const n = i + 1;
    if (!text(item.question)) return invalid(`Item ${n} has no question.`);
    const choices = item.choices.map((c) => text(c));
    const count = checkCount(`Item ${n} choices`, choices.length, LIMITS.choices);
    if (count) return count;
    if (choices.some((c) => !c)) return invalid(`Item ${n} has an empty choice.`);
    if (!Number.isInteger(item.correct) || item.correct < 0 || item.correct >= choices.length) {
      return invalid(
        `Item ${n}: correct must be the 0-based index of a choice (0 to ${choices.length - 1}).`,
      );
    }
  }
  return null;
}

function shorten(value: string, max = 80): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 3)}...` : clean;
}

function nodeName(state: TutorState, nodeId: string): string {
  return state.plan?.nodes.find((n) => n.id === nodeId)?.name ?? nodeId;
}

// ---------------------------------------------------------------- tutor

function decideTutor(
  state: TutorState,
  cmd: TutorToolCommand,
  ctx: CommandContext,
  out: Emitter,
): TutorError | null {
  const gate = gateTutorTool(state, ctx.flags, cmd.type);
  if (gate) return gate;

  switch (cmd.type) {
    case 'ask_intake': {
      const count = checkCount('Questions', cmd.questions.length, LIMITS.intakeQuestions);
      if (count) return count;
      const questions: IntakeQuestion[] = [];
      for (const [i, q] of cmd.questions.entries()) {
        if (!text(q.question)) return invalid(`Question ${i + 1} has no text.`);
        const options: IntakeOption[] = q.options
          .map((o) => ({ label: text(o.label), description: text(o.description) || undefined }))
          .filter((o) => o.label);
        const optionCount = checkCount(
          `Question ${i + 1} options`,
          options.length,
          LIMITS.intakeOptions,
        );
        if (optionCount) return optionCount;
        questions.push({
          id: `q${i + 1}`,
          question: text(q.question),
          ...(text(q.category) ? { category: text(q.category) } : {}),
          ...(q.allowMultiple ? { allowMultiple: true } : {}),
          options,
        });
      }
      out.push({
        type: 'intake_asked',
        intakeId: ctx.idFactory(),
        ...(text(cmd.title) ? { title: text(cmd.title) } : {}),
        questions,
      });
      return null;
    }

    case 'give_diagnostic': {
      if (!text(cmd.topic)) return invalid('The diagnostic needs a topic.');
      const count = checkCount('Items', cmd.items.length, LIMITS.diagnosticItems);
      if (count) return count;
      const bad = checkChoiceItems(cmd.items);
      if (bad) return bad;
      const items: DiagnosticItem[] = [];
      for (const [i, item] of cmd.items.entries()) {
        let nodeId: string | undefined;
        if (state.plan && text(item.nodeId)) {
          const found = resolveNode(state, item.nodeId, false);
          if (found.error) return found.error;
          nodeId = found.node.id;
        }
        items.push({
          id: `q${i + 1}`,
          question: text(item.question),
          choices: item.choices.map((c) => text(c)),
          correct: item.correct,
          ...(text(item.explanation) ? { explanation: text(item.explanation) } : {}),
          ...(nodeId ? { nodeId } : {}),
        });
      }
      out.push({
        type: 'diagnostic_given',
        diagnosticId: ctx.idFactory(),
        topic: text(cmd.topic),
        items,
      });
      return null;
    }

    case 'propose_plan': {
      const built = buildPlan(
        { goal: cmd.goal, nodes: cmd.nodes, metadata: cmd.metadata },
        state.plan,
        ctx.at,
      );
      if (!built.ok) {
        const keep = state.plan
          ? ` Reuse existing topic ids to keep their progress: ${state.plan.nodes.map((n) => n.id).join(', ')}.`
          : '';
        return err(
          'invalid_plan',
          built.problems.join(' '),
          `Fix these and call propose_plan again.${keep}`,
        );
      }
      const startingEstimates: Record<string, StartingEstimate> = {};
      cmd.nodes.forEach((node, i) => {
        const estimate = node.startingEstimate;
        const id = built.plan.nodes[i]?.id;
        if (!id || !estimate || !Number.isFinite(estimate.value) || estimate.value <= 0) return;
        startingEstimates[id] = {
          value: Math.min(STARTING_ESTIMATE_MAX, clamp01(estimate.value)),
          reason: text(estimate.reason),
        };
      });
      out.push({
        type: 'plan_proposed',
        proposalId: ctx.idFactory(),
        plan: built.plan,
        ...(text(cmd.rationale) ? { rationale: text(cmd.rationale) } : {}),
        revision: !!state.plan,
        ...(Object.keys(startingEstimates).length ? { startingEstimates } : {}),
      });
      return null;
    }

    case 'give_quiz': {
      const nodeId = state.currentNodeId;
      if (!nodeId) return resolveNode(state, undefined, true).error ?? null;
      const count = checkCount('Items', cmd.items.length, LIMITS.quizItems);
      if (count) return count;
      const bad = checkChoiceItems(cmd.items);
      if (bad) return bad;
      out.push({
        type: 'quiz_given',
        quizId: ctx.idFactory(),
        nodeId,
        ...(text(cmd.title) ? { title: text(cmd.title) } : {}),
        items: cmd.items.map((item, i) => ({
          id: `q${i + 1}`,
          question: text(item.question),
          choices: item.choices.map((c) => text(c)),
          correct: item.correct,
          ...(text(item.explanation) ? { explanation: text(item.explanation) } : {}),
        })),
      });
      return null;
    }

    case 'record_evidence': {
      const found = resolveNode(state, cmd.nodeId, true);
      if (found.error) return found.error;
      if (!OBSERVATION_KINDS.includes(cmd.kind)) {
        return invalid(
          `Unknown kind "${cmd.kind}".`,
          `Use one of: ${OBSERVATION_KINDS.join(', ')}.`,
        );
      }
      const note = text(cmd.note);
      if (!note) {
        return invalid(
          'Evidence needs a note saying what you observed.',
          'Set note to one short sentence about what the learner did, and call record_evidence again.',
        );
      }
      // setTo means "the learner says it is here"; on any other source it does not apply.
      if (typeof cmd.setTo === 'number' && cmd.source === 'learner_said') {
        if (!ctx.flags.learnerModelEditable) {
          return err(
            'not_editable',
            'The learner cannot correct the learner model in this session.',
            'Call record_evidence again without setTo (a weight moves the estimate instead), or leave the estimate as it is.',
          );
        }
        if (!Number.isFinite(cmd.setTo) || cmd.setTo < 0 || cmd.setTo > 1) {
          return invalid(
            'setTo must be between 0 and 1.',
            'Set setTo to a fraction between 0 and 1 (0.6 for 60%), or leave it out.',
          );
        }
        out.push({
          type: 'evidence_recorded',
          nodeId: found.node.id,
          source: 'learner_said',
          kind: cmd.kind,
          setTo: cmd.setTo,
          note,
        });
        return null;
      }
      const weight = cmd.weight ?? OBSERVATION_WEIGHTS[cmd.kind];
      if (!Number.isFinite(weight)) {
        return invalid('weight must be a number.', 'Leave weight out to use the default.');
      }
      const sign = OBSERVATION_SIGN[cmd.kind];
      if ((sign > 0 && weight < 0) || (sign < 0 && weight > 0)) {
        const upward = OBSERVATION_KINDS.filter((k) => OBSERVATION_SIGN[k] >= 0).join(', ');
        return invalid(
          `${cmd.kind} evidence must have a ${sign > 0 ? 'positive' : 'negative'} weight; got ${weight}.`,
          sign > 0
            ? `Change weight to a number from 0 to ${WEIGHT_MAX} (or leave it out for ${OBSERVATION_WEIGHTS[cmd.kind]}), or change kind to struggled or partial if the learner went backwards.`
            : `Change weight to a number from ${WEIGHT_MIN} to 0 (or leave it out for ${OBSERVATION_WEIGHTS[cmd.kind]}), or change kind to one of ${upward} if the learner did well.`,
        );
      }
      const scaled = cmd.helped && weight > 0 ? weight * HELPED_FACTOR : weight;
      out.push({
        type: 'evidence_recorded',
        nodeId: found.node.id,
        source: cmd.source === 'learner_said' ? 'learner_said' : 'observation',
        kind: cmd.kind,
        weight: clampWeight(scaled),
        note,
      });
      return null;
    }

    case 'note_misconception': {
      const found = resolveNode(state, cmd.nodeId, true);
      if (found.error) return found.error;
      const description = text(cmd.description);
      if (!description) return invalid('Describe the misconception.');
      const existing = state.mastery[found.node.id]?.misconceptions ?? [];
      const same = existing.find(
        (m) => m.description.trim().toLowerCase() === description.toLowerCase(),
      );
      const misconceptionId =
        same?.id ?? uniqueId(slugify(description), new Set(existing.map((m) => m.id)));
      out.push({
        type: 'misconception_noted',
        nodeId: found.node.id,
        misconceptionId,
        description: same?.description ?? description,
      });
      return null;
    }

    case 'resolve_misconception':
      return resolveMisconception(state, cmd, 'tutor', out);

    case 'complete_topic': {
      const found = resolveNode(state, cmd.nodeId, true);
      if (found.error) return found.error;
      const node = found.node;
      if (node.id !== state.currentNodeId) {
        return err(
          'topic_not_current',
          `"${node.id}" is not the topic in progress.`,
          `The topic in progress is "${state.currentNodeId}". Only it can be completed.`,
        );
      }
      if (cmd.how === 'skipped') {
        if (!ctx.flags.planEditable) {
          return err(
            'not_editable',
            'Topics cannot be skipped in this session.',
            'Keep teaching until the topic is mastered.',
          );
        }
      } else {
        const confidence = confidenceOf(state, node.id);
        if (confidence < READY) {
          return err(
            'not_ready',
            `${node.name} is at ${percent(confidence)}%; completing it as mastered needs ${percent(READY)}%.`,
            ctx.flags.planEditable
              ? 'Keep teaching, give a quiz, or record the evidence you have seen. If the learner asked to move on, use how "skipped".'
              : 'Keep teaching, give a quiz, or record the evidence you have seen.',
          );
        }
        const open = openMisconceptions(state, node.id);
        if (open.length) {
          return err(
            'open_misconceptions',
            `${node.name} still has open misconceptions: ${open.map((m) => `${m.id} (${m.description})`).join('; ')}.`,
            'Address them, then resolve_misconception, before completing the topic.',
          );
        }
      }
      out.push({
        type: 'topic_completed',
        nodeId: node.id,
        how: cmd.how,
        ...(text(cmd.note) ? { note: text(cmd.note) } : {}),
      });
      return null;
    }

    case 'start_topic':
      return startTopic(state, cmd.nodeId, 'tutor', out);
  }
}

// ---------------------------------------------------------------- shared

function startTopic(
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

function resolveMisconception(
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

function notEditable(what: string): TutorError {
  return err(
    'not_editable',
    `${what} is not available in this session.`,
    'The study settings turn it off.',
  );
}

// ---------------------------------------------------------------- learner

function decideLearner(
  state: TutorState,
  cmd: LearnerCommand,
  ctx: CommandContext,
  out: Emitter,
): TutorError | null {
  const { flags } = ctx;
  switch (cmd.type) {
    case 'answer_intake': {
      const intake = state.intakes[cmd.intakeId];
      if (!intake)
        return err(
          'unknown_card',
          `There is no intake "${cmd.intakeId}".`,
          'Answer the latest intake card.',
        );
      if (intake.responses)
        return err('already_answered', 'This intake was already answered.', 'Nothing to do.');
      if (intake.dismissed) return err('card_closed', 'This intake was closed.', 'Nothing to do.');
      const ids = intake.questions.map((q) => q.id);
      const responses: Record<string, string[]> = {};
      for (const [id, values] of Object.entries(cmd.responses)) {
        if (!ids.includes(id)) {
          return err(
            'unknown_item',
            `There is no question "${id}".`,
            `Valid question ids: ${ids.join(', ')}.`,
          );
        }
        const clean = values.map((v) => text(v)).filter(Boolean);
        if (clean.length) responses[id] = clean;
      }
      if (!Object.keys(responses).length) return invalid('Answer at least one question.');
      out.push({ type: 'intake_answered', intakeId: intake.intakeId, responses });
      return null;
    }

    case 'answer_diagnostic': {
      const diagnostic = state.diagnostics[cmd.diagnosticId];
      if (!diagnostic) {
        return err(
          'unknown_card',
          `There is no diagnostic "${cmd.diagnosticId}".`,
          'Answer the latest diagnostic card.',
        );
      }
      if (diagnostic.answers)
        return err('already_answered', 'This diagnostic was already answered.', 'Nothing to do.');
      if (diagnostic.dismissed)
        return err('card_closed', 'This diagnostic was closed.', 'Nothing to do.');
      const ids = diagnostic.items.map((i) => i.id);
      for (const id of Object.keys(cmd.answers)) {
        if (!ids.includes(id)) {
          return err(
            'unknown_item',
            `There is no item "${id}".`,
            `Valid item ids: ${ids.join(', ')}.`,
          );
        }
      }
      const missing = ids.filter((id) => typeof cmd.answers[id] !== 'number');
      if (missing.length) {
        return err(
          'incomplete_answers',
          `Unanswered: ${missing.join(', ')}.`,
          'Answer every item, then submit.',
        );
      }
      for (const item of diagnostic.items) {
        const choice = cmd.answers[item.id];
        if (!Number.isInteger(choice) || choice < 0 || choice >= item.choices.length) {
          return err(
            'invalid_choice',
            `Item ${item.id} has no choice ${choice}.`,
            `Choose 0 to ${item.choices.length - 1}.`,
          );
        }
      }
      out.push({
        type: 'diagnostic_answered',
        diagnosticId: diagnostic.diagnosticId,
        answers: cmd.answers,
      });
      for (const item of diagnostic.items) {
        if (typeof item.correct !== 'number') continue;
        const target = item.nodeId ?? state.currentNodeId;
        if (!target || !state.mastery[target]) continue;
        const correct = cmd.answers[item.id] === item.correct;
        out.push(
          {
            type: 'evidence_recorded',
            nodeId: target,
            source: 'diagnostic',
            kind: correct ? 'correct_answer' : 'incorrect_answer',
            weight: diagnosticWeight(correct),
            note: `Diagnostic, ${correct ? 'right' : 'wrong'}: "${shorten(item.question)}"`,
            ref: { diagnosticId: diagnostic.diagnosticId, itemId: item.id },
          },
          'system',
        );
      }
      return null;
    }

    case 'answer_quiz_item': {
      const quiz = state.quizzes[cmd.quizId];
      if (!quiz)
        return err(
          'unknown_card',
          `There is no quiz "${cmd.quizId}".`,
          'Answer the latest quiz card.',
        );
      if (quiz.dismissed) return err('card_closed', 'This quiz was closed.', 'Nothing to do.');
      const item = quiz.items.find((i) => i.id === cmd.itemId);
      if (!item) {
        return err(
          'unknown_item',
          `There is no item "${cmd.itemId}" in this quiz.`,
          `Valid item ids: ${quiz.items.map((i) => i.id).join(', ')}.`,
        );
      }
      if (quiz.answers[item.id])
        return err('already_answered', 'This item was already answered.', 'Nothing to do.');
      if (!Number.isInteger(cmd.choice) || cmd.choice < 0 || cmd.choice >= item.choices.length) {
        return err(
          'invalid_choice',
          `There is no choice ${cmd.choice}.`,
          `Choose 0 to ${item.choices.length - 1}.`,
        );
      }
      const correct = cmd.choice === item.correct;
      out.push({
        type: 'quiz_answered',
        quizId: quiz.quizId,
        itemId: item.id,
        choice: cmd.choice,
        correct,
      });
      if (state.mastery[quiz.nodeId]) {
        out.push(
          {
            type: 'evidence_recorded',
            nodeId: quiz.nodeId,
            source: 'quiz',
            kind: correct ? 'correct_answer' : 'incorrect_answer',
            weight: quizWeight(correct),
            note: `Quiz, ${correct ? 'right' : 'wrong'}: "${shorten(item.question)}"`,
            ref: { quizId: quiz.quizId, itemId: item.id },
          },
          'system',
        );
      }
      return null;
    }

    case 'approve_plan': {
      const stale = checkProposal(state, cmd.proposalId);
      if (stale) return stale;
      const approved = out.push({ type: 'plan_approved', proposalId: cmd.proposalId });
      const after = apply(state, approved);
      placeStartingEstimates(state, after, out);
      if (!after.currentNodeId) {
        const next = nextReadyNode(after.plan);
        if (next) out.push({ type: 'topic_started', nodeId: next.id }, 'system');
      }
      return null;
    }

    case 'decline_plan': {
      const stale = checkProposal(state, cmd.proposalId);
      if (stale) return stale;
      if (!flags.planEditable) return notEditable('Declining the plan');
      out.push({
        type: 'plan_declined',
        proposalId: cmd.proposalId,
        ...(text(cmd.feedback) ? { feedback: text(cmd.feedback) } : {}),
      });
      return null;
    }

    case 'start_topic': {
      if (state.phase !== 'teaching' && state.phase !== 'interlude') {
        return err(
          'wrong_phase',
          `A topic cannot be started in the ${state.phase} phase.`,
          state.phase === 'proposal'
            ? 'Approve or decline the pending plan first.'
            : state.phase === 'complete'
              ? 'Every topic is done. Reopen one for more practice.'
              : 'There is no plan yet.',
        );
      }
      if (state.phase === 'teaching' && !flags.planEditable)
        return notEditable('Switching topics mid-topic');
      return startTopic(state, cmd.nodeId, 'learner', out);
    }

    case 'mark_known': {
      if (!flags.planEditable) return notEditable('Marking a topic as known');
      const found = resolveNode(state, cmd.nodeId, false);
      if (found.error) return found.error;
      const node = found.node;
      if (node.status === 'completed') {
        return err('topic_completed', `${node.name} is already completed.`, 'Nothing to do.');
      }
      const confidence = confidenceOf(state, node.id);
      const floor = markKnownTarget(confidence);
      if (flags.learnerModelEditable && floor !== confidence) {
        out.push({
          type: 'evidence_recorded',
          nodeId: node.id,
          source: 'learner',
          kind: 'marked_known',
          setTo: floor,
          note: 'Marked as already known.',
        });
      }
      out.push({ type: 'topic_completed', nodeId: node.id, how: 'known' });
      return null;
    }

    case 'skip_topic': {
      if (!flags.planEditable) return notEditable('Skipping a topic');
      const found = resolveNode(state, cmd.nodeId, false);
      if (found.error) return found.error;
      if (found.node.status === 'completed') {
        return err('topic_completed', `${found.node.name} is already completed.`, 'Nothing to do.');
      }
      out.push({ type: 'topic_completed', nodeId: found.node.id, how: 'skipped' });
      return null;
    }

    case 'reopen_topic': {
      if (!flags.planEditable) return notEditable('Reopening a topic');
      const found = resolveNode(state, cmd.nodeId, false);
      if (found.error) return found.error;
      if (found.node.status !== 'completed') {
        return err(
          'topic_not_completed',
          `${found.node.name} is not completed.`,
          'Only a completed topic can be reopened.',
        );
      }
      out.push({ type: 'topic_reopened', nodeId: found.node.id });
      return null;
    }

    case 'more_practice': {
      const found = resolveNode(state, cmd.nodeId, false);
      if (found.error) return found.error;
      const node = found.node;
      const confidence = confidenceOf(state, node.id);
      const cap = morePracticeTarget(confidence);
      const lowers = flags.learnerModelEditable && cap !== confidence;
      if (node.status === 'completed') {
        if (!flags.planEditable) return notEditable('Reopening a topic');
        out.push({ type: 'topic_reopened', nodeId: node.id });
      } else {
        if (!flags.learnerModelEditable) return notEditable('Correcting the learner model');
        if (!lowers) {
          return err(
            'nothing_to_change',
            `${node.name} is already at ${percent(confidence)}%, below the practice cap.`,
            'Nothing to do.',
          );
        }
      }
      if (lowers) {
        out.push({
          type: 'evidence_recorded',
          nodeId: node.id,
          source: 'learner',
          kind: 'more_practice',
          setTo: cap,
          note: 'Asked for more practice.',
        });
      }
      return null;
    }

    case 'adjust_mastery': {
      if (!flags.learnerModelEditable) return notEditable('Correcting the learner model');
      const found = resolveNode(state, cmd.nodeId, false);
      if (found.error) return found.error;
      if (!Number.isFinite(cmd.setTo) || cmd.setTo < 0 || cmd.setTo > 1) {
        return invalid('setTo must be between 0 and 1.');
      }
      if (cmd.setTo === confidenceOf(state, found.node.id)) {
        return err(
          'nothing_to_change',
          `${found.node.name} is already at that value.`,
          'Nothing to do.',
        );
      }
      out.push({
        type: 'evidence_recorded',
        nodeId: found.node.id,
        source: 'learner',
        kind: 'adjusted',
        setTo: cmd.setTo,
        note: text(cmd.note) || `Set to ${percent(cmd.setTo)}% by the learner.`,
      });
      return null;
    }

    case 'resolve_misconception':
      if (!flags.learnerModelEditable) return notEditable('Correcting the learner model');
      return resolveMisconception(state, cmd, 'learner', out);

    case 'flag_review': {
      if (!flags.learnerModelEditable) return notEditable('Flagging a topic for review');
      const found = resolveNode(state, cmd.nodeId, false);
      if (found.error) return found.error;
      if (!!state.mastery[found.node.id]?.needsReview === cmd.flagged) {
        return err(
          'nothing_to_change',
          `${nodeName(state, found.node.id)} is already ${cmd.flagged ? 'flagged' : 'not flagged'} for review.`,
          'Nothing to do.',
        );
      }
      out.push({ type: 'review_flagged', nodeId: found.node.id, flagged: cmd.flagged });
      return null;
    }

    case 'dismiss_card': {
      const card =
        cmd.card === 'intake'
          ? state.intakes[cmd.cardId]
          : cmd.card === 'diagnostic'
            ? state.diagnostics[cmd.cardId]
            : state.quizzes[cmd.cardId];
      if (!card)
        return err('unknown_card', `There is no ${cmd.card} "${cmd.cardId}".`, 'Nothing to close.');
      if (card.dismissed)
        return err('card_closed', `This ${cmd.card} is already closed.`, 'Nothing to do.');
      const done =
        'responses' in card && card.responses
          ? true
          : 'quizId' in card
            ? quizFinished(card)
            : 'diagnosticId' in card && !!card.answers;
      if (done)
        return err(
          'already_answered',
          `This ${cmd.card} is already answered.`,
          'Nothing to close.',
        );
      out.push({ type: 'card_dismissed', card: cmd.card, cardId: cmd.cardId });
      return null;
    }
  }
}

/**
 * A proposal's starting estimates, as evidence the learner can see, question
 * and contest like any other. Only a topic with no evidence of its own takes
 * one: what the learner has already shown outranks a guess made before.
 */
function placeStartingEstimates(before: TutorState, after: TutorState, out: Emitter): void {
  const estimates = before.proposal?.startingEstimates;
  if (!estimates) return;
  const fromDiagnostic = Object.values(before.diagnostics).some((d) => !!d.answers);
  for (const [nodeId, estimate] of Object.entries(estimates)) {
    const topic = after.mastery[nodeId];
    if (!topic || topic.evidence.length > 0) continue;
    const setTo = Math.min(STARTING_ESTIMATE_MAX, clamp01(estimate.value));
    if (setTo === topic.confidence) continue;
    const reason = estimate.reason || 'From what the learner said before the plan';
    out.push(
      {
        type: 'evidence_recorded',
        nodeId,
        source: fromDiagnostic ? 'diagnostic' : 'placement',
        kind: 'placement',
        setTo,
        note: fromDiagnostic ? `Starting estimate from the diagnostic: ${reason}` : reason,
      },
      'system',
    );
  }
}

function checkProposal(state: TutorState, proposalId: string): TutorError | null {
  const pending = state.proposal;
  if (!pending) return err('no_proposal', 'There is no plan proposal waiting.', 'Nothing to do.');
  if (pending.proposalId !== proposalId) {
    return err(
      'stale_proposal',
      'That proposal has been replaced by a newer one.',
      `Respond to the latest proposal, "${pending.proposalId}".`,
    );
  }
  return null;
}
