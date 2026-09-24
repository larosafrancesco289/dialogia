// Module: tutor engine render
// Responsibility: the compact plain-text state block the tutor reads every turn, and the learner's changes since a point in the log.

import type { LearningPlanNode } from '@/lib/types';
import type { TutorEvent } from '@/modules/tutor/engine/events';
import type { TutorFlags } from '@/modules/tutor/engine/flags';
import { apply, effectiveEvents, fold } from '@/modules/tutor/engine/fold';
import { nextReadyNode, unmetPrerequisites } from '@/modules/tutor/engine/plan';
import { PRACTISING, READY, masteryBand, percent } from '@/modules/tutor/engine/rules';
import {
  confidenceOf,
  currentNode,
  openMisconceptions,
  remainingBudgets,
  type DiagnosticRecord,
  type TutorPhase,
  type TutorState,
} from '@/modules/tutor/engine/state';

const PHASE_LINE: Record<TutorPhase, string> = {
  intake: 'intake (no plan yet: learn the goal and prior knowledge, then propose a plan)',
  proposal: "proposal (a plan proposal is waiting for the learner's approval)",
  teaching: 'teaching',
  interlude:
    'interlude (a topic just finished; the learner sees a chapter break and chooses what comes next)',
  complete: 'complete (every topic is done; offer review or propose a new plan)',
};

const HOW_LABEL = { mastered: 'mastered', known: 'known already', skipped: 'skipped' } as const;

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function quote(value: string, max = 80): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return `"${clean.length > max ? `${clean.slice(0, max - 3)}...` : clean}"`;
}

function topicLine(state: TutorState, node: LearningPlanNode): string {
  const c = confidenceOf(state, node.id);
  const parts: string[] = [];
  if (node.status === 'completed') {
    parts.push(node.completedHow ? `done (${HOW_LABEL[node.completedHow]})` : 'done');
  } else if (node.status === 'in_progress') {
    parts.push('in progress');
  } else {
    parts.push('not started');
  }
  parts.push(`${masteryBand(c)} ${percent(c)}%`);
  if (state.mastery[node.id]?.needsReview) parts.push('flagged for review');
  if (node.status === 'not_started' && state.plan) {
    const unmet = unmetPrerequisites(state.plan, node);
    if (unmet.length) parts.push(`needs ${unmet.map((n) => n.id).join(', ')}`);
  }
  return `- ${node.name} [${node.id}]: ${parts.join('; ')}`;
}

function diagnosticSummary(diagnostic: DiagnosticRecord): string | undefined {
  const answers = diagnostic.answers;
  if (!answers) return undefined;
  const scored = diagnostic.items.filter((i) => typeof i.correct === 'number');
  const right = scored.filter((i) => answers[i.id] === i.correct).length;
  const missed = scored
    .filter((i) => answers[i.id] !== i.correct)
    .map((i) => quote(i.question, 60));
  return `Diagnostic on ${quote(diagnostic.topic, 60)}: ${right} of ${scored.length} right${
    missed.length ? `; missed ${missed.join(', ')}` : ''
  }.`;
}

function awaitingLine(state: TutorState): string | undefined {
  const open = state.awaiting;
  if (!open) return undefined;
  switch (open.kind) {
    case 'intake':
      return 'Waiting on: the learner to answer your intake questions. No other card until they do.';
    case 'diagnostic':
      return 'Waiting on: the learner to finish your diagnostic. No other card until they do.';
    case 'quiz': {
      const quiz = state.quizzes[open.id];
      const done = quiz ? Object.keys(quiz.answers).length : 0;
      const total = quiz?.items.length ?? 0;
      return `Waiting on: the learner to finish your quiz (${done} of ${total} answered). No other card until they do.`;
    }
    case 'proposal':
      return 'Waiting on: the learner to approve or decline your plan proposal.';
  }
}

function controlsLine(flags: TutorFlags): string {
  const plan = flags.planEditable ? 'may change the plan' : 'may not change the plan';
  const model = !flags.learnerModelVisible
    ? 'does not see the learner model (do not quote mastery numbers)'
    : flags.learnerModelEditable
      ? 'sees the learner model and may correct it'
      : 'sees the learner model but may not correct it';
  return `Learner controls: ${plan}; ${model}.`;
}

export type RenderOptions = {
  flags: TutorFlags;
  /** From `learnerChangesSince`: shown last, as authoritative. */
  learnerChanges?: string[];
};

/** The tutor's view of the session, rendered fresh for every request. Plain text, short. */
export function renderStateBlock(state: TutorState, options: RenderOptions): string {
  const lines: string[] = ['Tutor state'];
  const plan = state.plan;
  const current = currentNode(state);

  if (plan) {
    const done = plan.nodes.filter((n) => n.status === 'completed').length;
    lines.push(`Goal: ${plan.goal} (${done} of ${plan.nodes.length} topics done)`);
  }
  lines.push(`Phase: ${PHASE_LINE[state.phase]}`);

  if (current) {
    lines.push(`Current topic: ${current.name} [${current.id}]`);
    lines.push(`Objectives: ${current.objectives.join('; ')}`);
  } else if (state.phase === 'interlude') {
    const next = nextReadyNode(plan);
    if (next) lines.push(`Next in the plan: ${next.name} [${next.id}]`);
  }

  if (plan) {
    lines.push(
      `Topics (building < ${percent(PRACTISING)}%, practising ${percent(PRACTISING)}-${percent(READY) - 1}%, ready >= ${percent(READY)}%):`,
    );
    for (const node of plan.nodes) lines.push(topicLine(state, node));
    const open = plan.nodes.flatMap((node) =>
      openMisconceptions(state, node.id).map(
        (m) =>
          `- ${m.id} on ${node.id}${m.occurrences > 1 ? ` (seen ${m.occurrences}x)` : ''}: ${m.description}`,
      ),
    );
    if (open.length) lines.push('Open misconceptions:', ...open);
  }

  if (state.proposal) {
    const kind = state.proposal.revision ? 'revision' : 'plan';
    lines.push(
      `Pending ${kind} proposal: ${state.proposal.plan.nodes.map((n) => n.id).join(', ')}.`,
    );
  } else if (state.lastDeclined) {
    const feedback = state.lastDeclined.feedback;
    lines.push(
      `The learner declined your last plan proposal${feedback ? `: ${quote(feedback, 200)}.` : '.'}`,
    );
  }

  if (!plan) {
    for (const intake of Object.values(state.intakes)) {
      const responses = intake.responses;
      if (!responses) continue;
      lines.push('Intake answers:');
      for (const question of intake.questions) {
        const answer = responses[question.id];
        if (answer?.length) lines.push(`- ${quote(question.question, 60)}: ${answer.join(', ')}`);
      }
    }
  }
  if (state.phase !== 'teaching') {
    for (const diagnostic of Object.values(state.diagnostics)) {
      const summary = diagnosticSummary(diagnostic);
      if (summary) lines.push(summary);
    }
  }

  const waiting = awaitingLine(state);
  if (waiting) lines.push(waiting);

  const budgets = remainingBudgets(state);
  const quizzes =
    budgets.quizzesLeft != null
      ? `${count(budgets.quizzesLeft, 'quiz', 'quizzes')} left on this topic, `
      : '';
  lines.push(
    `Budget: ${quizzes}${count(budgets.diagnosticsLeft, 'diagnostic', 'diagnostics')} left.`,
  );
  lines.push(controlsLine(options.flags));

  if (options.learnerChanges?.length) {
    lines.push(
      "Since the learner's last message, the learner changed (authoritative: these are the learner's decisions; build on them, do not undo them):",
      ...options.learnerChanges.map((line) => `- ${line}`),
    );
  }
  return lines.join('\n');
}

/**
 * Plain sentences for what the learner did after `seq`: answers, approvals,
 * and the quiet edits (sliders, mark known, flags) that never sent a message.
 * Replays the log so each change can say what it changed from.
 */
export function learnerChangesSince(
  state: TutorState,
  events: readonly TutorEvent[],
  seq: number,
): string[] {
  const sorted = effectiveEvents(events);
  let rolling = fold(sorted.filter((e) => e.seq <= seq));
  const name = (id: string) =>
    state.plan?.nodes.find((n) => n.id === id)?.name ??
    rolling.plan?.nodes.find((n) => n.id === id)?.name ??
    id;

  const lines: string[] = [];
  const quizLines = new Map<string, number>();

  for (const event of sorted) {
    if (event.seq <= seq) continue;
    const before = rolling;
    rolling = apply(rolling, event);
    if (event.by !== 'learner') continue;

    switch (event.type) {
      case 'intake_answered': {
        const intake = rolling.intakes[event.intakeId];
        const answers = (intake?.questions ?? [])
          .filter((q) => event.responses[q.id]?.length)
          .map((q) => `${quote(q.question, 60)}: ${event.responses[q.id].join(', ')}`);
        lines.push(`Answered the intake. ${answers.join('; ')}`);
        break;
      }
      case 'diagnostic_answered': {
        const diagnostic = rolling.diagnostics[event.diagnosticId];
        const summary = diagnostic && diagnosticSummary(diagnostic);
        if (summary) lines.push(`Finished the diagnostic. ${summary}`);
        break;
      }
      case 'quiz_answered':
        if (!quizLines.has(event.quizId)) {
          quizLines.set(event.quizId, lines.length);
          lines.push('');
        }
        break;
      case 'plan_approved':
        lines.push('Approved your plan proposal.');
        break;
      case 'plan_declined':
        lines.push(
          `Declined your plan proposal${event.feedback ? `: ${quote(event.feedback, 200)}.` : '.'}`,
        );
        break;
      case 'topic_started':
        lines.push(`Started ${name(event.nodeId)}.`);
        break;
      case 'topic_completed': {
        const topic = name(event.nodeId);
        if (event.how === 'known') {
          lines.push(
            `Marked ${topic} as already known (now ${percent(confidenceOf(rolling, event.nodeId))}%).`,
          );
        } else if (event.how === 'skipped') {
          lines.push(`Skipped ${topic}.`);
        } else {
          lines.push(`Completed ${topic}.`);
        }
        break;
      }
      case 'topic_reopened':
        lines.push(`Reopened ${name(event.nodeId)} for more practice.`);
        break;
      case 'evidence_recorded': {
        if (event.kind === 'marked_known') break;
        const from = percent(confidenceOf(before, event.nodeId));
        const to = percent(confidenceOf(rolling, event.nodeId));
        const why = event.kind === 'more_practice' ? ' by asking for more practice' : '';
        lines.push(`Set ${name(event.nodeId)} to ${to}%${why} (was ${from}%).`);
        break;
      }
      case 'misconception_resolved': {
        const m = rolling.mastery[event.nodeId]?.misconceptions.find(
          (x) => x.id === event.misconceptionId,
        );
        lines.push(
          `Marked the misconception ${quote(m?.description ?? event.misconceptionId, 80)} on ${name(event.nodeId)} as resolved.`,
        );
        break;
      }
      case 'review_flagged':
        lines.push(
          event.flagged
            ? `Flagged ${name(event.nodeId)} for review.`
            : `Removed the review flag from ${name(event.nodeId)}.`,
        );
        break;
      case 'card_dismissed':
        lines.push(`Closed your ${event.card} without finishing it.`);
        break;
      default:
        break;
    }
  }

  for (const [quizId, index] of quizLines) {
    const quiz = rolling.quizzes[quizId];
    if (!quiz) continue;
    const answered = quiz.items.filter((item) => quiz.answers[item.id]);
    const right = answered.filter((item) => quiz.answers[item.id].correct).length;
    const missed = answered
      .filter((item) => !quiz.answers[item.id].correct)
      .map(
        (item) =>
          `${quote(item.question, 60)} (chose ${quote(item.choices[quiz.answers[item.id].choice], 40)}; right answer ${quote(item.choices[item.correct], 40)})`,
      );
    lines[index] =
      `Answered your quiz on ${name(quiz.nodeId)}: ${right} of ${answered.length} right` +
      (answered.length < quiz.items.length ? ` (${quiz.items.length} items)` : '') +
      (missed.length ? `. Missed: ${missed.join('; ')}.` : '.');
  }
  return lines;
}
