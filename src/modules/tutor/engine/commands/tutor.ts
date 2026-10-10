// Module: tutor engine tutor commands
// Responsibility: `decide` for the tutor's tool calls: the gate first, then each tool's own rules.

import type {
  CarrySource,
  DiagnosticItem,
  IntakeOption,
  IntakeQuestion,
  StartingEstimate,
} from '@/modules/tutor/engine/events';
import {
  buildPlan,
  findPlanNode,
  slugify,
  uniqueId,
  type PlanNodeInput,
} from '@/modules/tutor/engine/plan';
import {
  AFTER_CORRECTION_FACTOR,
  LIMITS,
  MASTERY_EVIDENCE_MIN,
  OBSERVATION_KINDS,
  OBSERVATION_SIGN,
  OBSERVATION_WEIGHTS,
  READY,
  WEIGHT_MAX,
  WEIGHT_MIN,
  clamp01,
  clampWeight,
  observationWeight,
  percent,
  reaches,
} from '@/modules/tutor/engine/rules';
import {
  confidenceOf,
  demonstratedEvidence,
  earlierMistake,
  followsCorrection,
  isMeasured,
  openMisconceptions,
  remainingBudgets,
  replyRecord,
  startingEstimateCap,
  type TutorState,
} from '@/modules/tutor/engine/state';
import { SITTING_GAP_MS, canReview, reviewSchedule } from '@/modules/tutor/engine/review';
import { gateTutorTool } from '@/modules/tutor/engine/commands/gate';
import {
  err,
  invalid,
  resolveMisconception,
  resolveNode,
  shorten,
  startTopic,
  text,
  type Emitter,
} from '@/modules/tutor/engine/commands/shared';
import type {
  CommandContext,
  TutorError,
  TutorToolCommand,
} from '@/modules/tutor/engine/commands/types';

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

export function decideTutor(
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
        { goal: cmd.goal, subject: cmd.subject, nodes: cmd.nodes, metadata: cmd.metadata },
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
      const carriedOver: Record<string, CarrySource> = {};
      const startingEstimates: Record<string, StartingEstimate> = {};
      const cap = startingEstimateCap(state);
      // An earlier topic carries to one topic here: what was shown on it says
      // nothing yet about the topics built on it.
      const carried = new Set<string>();
      cmd.nodes.forEach((node, i) => {
        const id = built.plan.nodes[i]?.id;
        const found = carrySource(node.carriedFrom, ctx.otherChats);
        const source = found && !carried.has(`${found.chatId}/${found.nodeId}`) ? found : undefined;
        if (source) carried.add(`${source.chatId}/${source.nodeId}`);
        if (id && source) carriedOver[id] = source;
        const estimate = node.startingEstimate;
        if (!id || source || !estimate || !Number.isFinite(estimate.value) || estimate.value <= 0) {
          return;
        }
        startingEstimates[id] = {
          value: Math.min(cap, clamp01(estimate.value)),
          reason: text(estimate.reason),
        };
      });
      if (state.awaiting?.kind === 'intake') {
        out.push({ type: 'card_dismissed', card: 'intake', cardId: state.awaiting.id });
      }
      out.push({
        type: 'plan_proposed',
        proposalId: ctx.idFactory(),
        plan: built.plan,
        ...(text(cmd.rationale) ? { rationale: text(cmd.rationale) } : {}),
        revision: !!state.plan,
        ...(Object.keys(startingEstimates).length ? { startingEstimates } : {}),
        ...(Object.keys(carriedOver).length ? { carriedOver } : {}),
      });
      return null;
    }

    case 'give_quiz': {
      const target = quizTarget(state, cmd.nodeId, ctx.at);
      if (target.error) return target.error;
      const { nodeId, review } = target;
      const count = checkCount('Items', cmd.items.length, LIMITS.quizItems);
      if (count) return count;
      const bad = checkChoiceItems(cmd.items);
      if (bad) return bad;
      out.push({
        type: 'quiz_given',
        quizId: ctx.idFactory(),
        nodeId,
        ...(review ? { review: true as const } : {}),
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
      const node = found.node;
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
      const reply = replyRecord(state, ctx.messageId);
      if (reply?.evidence[node.id]) {
        return err(
          'already_recorded',
          `You already recorded evidence on ${node.name} in this reply.`,
          'One piece of evidence per topic per reply, summing up the exchange. Nothing more to record on it now.',
        );
      }
      const weight = cmd.weight ?? OBSERVATION_WEIGHTS[cmd.kind];
      if (!Number.isFinite(weight)) {
        return invalid('weight must be a number.', 'Leave weight out to use the default.');
      }
      const sign = OBSERVATION_SIGN[cmd.kind];
      if ((sign > 0 && weight < 0) || (sign < 0 && weight > 0)) {
        const upward = OBSERVATION_KINDS.filter((k) => OBSERVATION_SIGN[k] > 0).join(', ');
        // Its own code: the call contradicts itself, and one right answer is to record nothing.
        return err(
          'weight_against_kind',
          `${cmd.kind} evidence must have a ${sign > 0 ? 'positive' : 'negative'} weight; got ${weight}.`,
          sign > 0
            ? `Change weight to a number from 0 to ${WEIGHT_MAX} (or leave it out for ${OBSERVATION_WEIGHTS[cmd.kind]}), or change kind to struggled if the answer was wrong. If they have not answered yet, there is nothing to record.`
            : `Change weight to a number from ${WEIGHT_MIN} to 0 (or leave it out for ${OBSERVATION_WEIGHTS[cmd.kind]}), or change kind to one of ${upward} if the learner did well.`,
        );
      }
      const observed = observationWeight(cmd.kind, weight, !!cmd.helped);
      const scaled =
        observed > 0 && followsCorrection(state, node.id)
          ? observed * AFTER_CORRECTION_FACTOR
          : observed;
      // A reply that noted a misconception its answer showed gains nothing on the topic.
      const gains = scaled > 0 && !reply?.misconceptions.includes(node.id);
      out.push({
        type: 'evidence_recorded',
        nodeId: node.id,
        source: cmd.source === 'learner_said' ? 'learner_said' : 'observation',
        kind: cmd.kind,
        weight: gains || scaled < 0 ? clampWeight(scaled) : 0,
        note,
        ...(cmd.helped ? { helped: true } : {}),
      });
      return null;
    }

    case 'note_misconception': {
      const found = resolveNode(state, cmd.nodeId, true);
      if (found.error) return found.error;
      const description = text(cmd.description);
      if (!description) return invalid('Describe the misconception.');
      const existing = state.mastery[found.node.id]?.misconceptions ?? [];
      const named = text(cmd.misconceptionId);
      const same =
        (named ? existing.find((m) => m.id === named) : undefined) ??
        existing.find((m) => m.description.trim().toLowerCase() === description.toLowerCase());
      const misconceptionId =
        same?.id ?? uniqueId(slugify(description), new Set(existing.map((m) => m.id)));
      // An earlier answer can have shown it only if the log holds that answer
      // as a mistake; otherwise the answer this reply responds to showed it.
      const earlier =
        cmd.shownBy === 'earlier_answer' && earlierMistake(state, found.node.id, ctx.messageId);
      out.push({
        type: 'misconception_noted',
        nodeId: found.node.id,
        misconceptionId,
        description: same?.description ?? description,
        ...(earlier ? { shownBy: 'earlier_answer' as const } : {}),
      });
      if (!earlier) takeBackGain(state, found.node.id, same?.description ?? description, ctx, out);
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
        if (!reaches(confidence, READY)) {
          return err(
            'not_ready',
            `${node.name} is at ${percent(confidence)}%; completing it as mastered needs ${percent(READY)}%.`,
            ctx.flags.planEditable
              ? 'Keep teaching, give a quiz, or record the evidence you have seen. If the learner asked to move on, use how "skipped".'
              : 'Keep teaching, give a quiz, or record the evidence you have seen.',
          );
        }
        const shown = demonstratedEvidence(state, node.id);
        if (shown < MASTERY_EVIDENCE_MIN) {
          const missing = MASTERY_EVIDENCE_MIN - shown;
          return err(
            'not_ready',
            `${node.name} is at ${percent(confidence)}%, but only ${shown} of the ${MASTERY_EVIDENCE_MIN} pieces of evidence mastery needs show the learner getting it right in this session, since the topic was last opened; a starting estimate or a mistake does not count.`,
            `Get ${missing} more: give_quiz, or record_evidence for something the learner did on their own. Then call complete_topic again.`,
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
      // The chapter break is the learner's choice: the reply that closed a
      // topic cannot also open the next one.
      if (ctx.messageId && state.lastCompletedBy === ctx.messageId && state.phase === 'interlude') {
        return err(
          'learner_chooses',
          'You completed a topic in this reply; the next one cannot start in the same reply.',
          'The learner chooses what comes next at the chapter break. End this turn with a short closing line for the topic, and call start_topic only in a later turn if they ask to go on.',
        );
      }
      return startTopic(state, cmd.nodeId, 'tutor', out);
  }
}

/**
 * Which topic a quiz is on: the one in progress by default, or one already
 * studied as a refresher, at most once a sitting. Refreshers do not spend the
 * topic's quiz budget; quizzes on the topic in progress do.
 */
function quizTarget(
  state: TutorState,
  ref: string | undefined,
  at: number,
): { nodeId: string; review: boolean; error?: undefined } | { error: TutorError } {
  const reviewable = reviewSchedule(state).map((s) => s.nodeId);
  const studied = reviewable.length
    ? `Topics already studied, which can take a refresher: ${reviewable.join(', ')}.`
    : 'No topic has been studied yet to review.';
  const current = state.currentNodeId;
  let nodeId = current;
  if (text(ref)) {
    const found = resolveNode(state, ref, false);
    if (found.error) return { error: found.error };
    nodeId = found.node.id;
  }
  if (!nodeId) {
    return {
      error: err(
        'no_current_topic',
        'No topic is in progress, so the quiz needs a topicId.',
        `Give the topicId of a topic to refresh. ${studied}`,
      ),
    };
  }
  if (nodeId === current) {
    if (remainingBudgets(state).quizzesLeft === 0) {
      return {
        error: err(
          'budget_exhausted',
          'No quizzes left for the topic in progress.',
          'Check understanding in conversation and use record_evidence instead.',
        ),
      };
    }
    return { nodeId, review: false };
  }
  if (!canReview(state, nodeId)) {
    return {
      error: err(
        'not_studied',
        `"${nodeId}" has not been studied yet, so there is nothing to refresh.`,
        `Quiz the topic in progress (leave topicId out), or a topic already studied. ${studied}`,
      ),
    };
  }
  const recent = Object.values(state.quizzes).some(
    (quiz) => quiz.review && quiz.nodeId === nodeId && at - quiz.at < SITTING_GAP_MS,
  );
  if (recent) {
    return {
      error: err(
        'budget_exhausted',
        `${nodeId} already had a refresher in this sitting.`,
        'Talk it through in conversation instead. If the learner wants more practice on it, they can take the topic up again.',
      ),
    };
  }
  return { nodeId, review: true };
}

/**
 * The topic of another tutor chat a proposed topic continues, or undefined
 * when that chat or topic is unknown, or the topic has no estimate to carry.
 */
function carrySource(
  ref: PlanNodeInput['carriedFrom'],
  otherChats: CommandContext['otherChats'],
): CarrySource | undefined {
  const chat = ref ? otherChats?.[ref.chatId] : undefined;
  if (!ref || !chat?.plan) return undefined;
  const wanted = text(ref.topic).toLowerCase();
  const node =
    findPlanNode(chat.plan, ref.topic) ??
    chat.plan.nodes.find((n) => n.name.trim().toLowerCase() === wanted);
  if (!node || !isMeasured(chat.mastery[node.id])) return undefined;
  return { chatId: ref.chatId, nodeId: node.id, topic: node.name };
}

/**
 * A misconception noted after the same reply recorded a gain on its topic:
 * the answer that showed it earns nothing, so the gain is taken back, exactly
 * (the log is append-only), and the evidence it came from stops counting
 * toward mastery (`demonstratedEvidence`).
 */
function takeBackGain(
  state: TutorState,
  nodeId: string,
  description: string,
  ctx: CommandContext,
  out: Emitter,
): void {
  const recorded = replyRecord(state, ctx.messageId)?.evidence[nodeId];
  if (!recorded || recorded.after - recorded.before < 0.005) return;
  const now = confidenceOf(state, nodeId);
  out.push({
    type: 'evidence_recorded',
    nodeId,
    source: 'observation',
    kind: 'misconception',
    setTo: clamp01(now - (recorded.after - recorded.before)),
    note: `No gain from this answer: it showed a misconception (${shorten(description, 120)})`,
    ref: { eventId: recorded.eventId },
  });
}
