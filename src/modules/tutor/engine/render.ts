// Module: tutor engine render
// Responsibility: the compact plain-text state block the tutor reads every turn, and the learner's changes since a point in the log.

import type { LearningPlanNode, LearningRecord, LearningTopic } from '@/lib/types';
import type { TutorEvent } from '@/modules/tutor/engine/events';
import type { TutorFlags } from '@/modules/tutor/engine/flags';
import { apply, effectiveEvents, fold } from '@/modules/tutor/engine/fold';
import { nextReadyNode, unmetPrerequisites } from '@/modules/tutor/engine/plan';
import {
  MASTERY_PRIOR,
  PRACTISING,
  READY,
  masteryBand,
  percent,
} from '@/modules/tutor/engine/rules';
import {
  DAY_MS,
  HOUR_MS,
  SITTING_GAP_MS,
  dueTopics,
  lastStudiedAt,
} from '@/modules/tutor/engine/review';
import {
  confidenceOf,
  currentNode,
  diagnosed,
  openMisconceptions,
  remainingBudgets,
  startingEstimateCap,
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

/** How long ago, in the units a person would use. */
function ago(ms: number): string {
  if (ms < HOUR_MS) return 'just now';
  if (ms < DAY_MS) return `${count(Math.floor(ms / HOUR_MS), 'hour', 'hours')} ago`;
  return `${count(Math.floor(ms / DAY_MS), 'day', 'days')} ago`;
}

function topicLine(
  state: TutorState,
  node: LearningPlanNode,
  now: number | undefined,
  due: ReadonlySet<string>,
): string {
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
  if (state.mastery[node.id]?.evidence.some((entry) => entry.carriedOver)) {
    parts.push('carried over from another chat');
  }
  if (state.mastery[node.id]?.needsReview) parts.push('flagged for review');
  const studied = now != null ? lastStudiedAt(state, node.id) : undefined;
  if (now != null && studied != null) parts.push(`last studied ${ago(now - studied)}`);
  if (due.has(node.id)) parts.push('due for a refresher');
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
  // Which wrong choice they picked, not only that they missed: the picks are
  // where a shared wrong belief shows.
  const missed = scored
    .filter((i) => answers[i.id] !== i.correct)
    .map((i) => {
      const picked = i.choices[answers[i.id]];
      return `${quote(i.question, 60)} (chose ${picked == null ? 'nothing' : quote(picked, 40)}; right answer ${quote(i.choices[i.correct!], 40)})`;
    });
  return `Diagnostic on ${quote(diagnostic.topic, 60)}: ${right} of ${scored.length} right${
    missed.length ? `. Missed: ${missed.join('; ')}` : ''
  }.`;
}

/** How many questions the tutor is reminded of per topic: the most recent. */
const ASKED_SHOWN = 6;

/**
 * The questions already put to the learner on a topic, in quizzes and
 * diagnostics, most recent last, with how each went: the tutor's memory of
 * practice, so it builds on them instead of asking them again.
 */
function askedOnTopic(state: TutorState, nodeId: string, before: number): string[] {
  const asked: Array<{ seq: number; order: number; line: string }> = [];
  for (const quiz of Object.values(state.quizzes)) {
    if (quiz.nodeId !== nodeId || quiz.seq > before) continue;
    quiz.items.forEach((item, order) => {
      const answer = quiz.answers[item.id];
      const how = answer ? (answer.correct ? 'right' : 'wrong') : 'not answered';
      asked.push({ seq: quiz.seq, order, line: `- ${quote(item.question, 70)} (quiz, ${how})` });
    });
  }
  for (const diagnostic of Object.values(state.diagnostics)) {
    if (diagnostic.seq > before) continue;
    diagnostic.items.forEach((item, order) => {
      if (item.nodeId !== nodeId) return;
      const choice = diagnostic.answers?.[item.id];
      const how =
        choice == null || typeof item.correct !== 'number'
          ? 'not scored'
          : choice === item.correct
            ? 'right'
            : 'wrong';
      asked.push({
        seq: diagnostic.seq,
        order,
        line: `- ${quote(item.question, 70)} (diagnostic, ${how})`,
      });
    });
  }
  return asked
    .sort((a, b) => a.seq - b.seq || a.order - b.order)
    .slice(-ASKED_SHOWN)
    .map((entry) => entry.line);
}

/** How many of the learner's recorded answers on the current topic the tutor is reminded of. */
const ANSWERS_SHOWN = 4;

/**
 * What the tutor last recorded of the learner's own answers on a topic since
 * it was (re)opened, most recent last: the conversation's memory of practice,
 * as `askedOnTopic` is the cards', so a question they have answered is not put
 * to them again in new words.
 */
function shownOnTopic(state: TutorState, nodeId: string): string[] {
  const since = state.counts.evidenceAtReopen[nodeId] ?? 0;
  return (state.mastery[nodeId]?.evidence ?? [])
    .slice(since)
    .filter(
      (entry) =>
        !!entry.eventId &&
        entry.kind !== 'misconception' &&
        (entry.source === 'observation' || entry.source === 'learner_said'),
    )
    .slice(-ANSWERS_SHOWN)
    .map((entry) => `- ${entry.kind ?? 'observed'}: ${quote(entry.details, 100)}`);
}

function budgetsAllowDiagnostic(state: TutorState): boolean {
  return remainingBudgets(state).diagnosticsLeft > 0;
}

/** How many topics after the current one the tutor is shown the objectives of. */
const LATER_SHOWN = 2;

/**
 * The next topics in the plan with their objectives, so the tutor sees where
 * the current topic ends instead of teaching the later ones inside it.
 */
function laterTopicLines(state: TutorState): string[] {
  return (state.plan?.nodes ?? [])
    .filter((node) => node.status === 'not_started')
    .slice(0, LATER_SHOWN)
    .map((node) => `- ${node.name} [${node.id}]: ${node.objectives.join('; ')}`);
}

/** How many of the learner's other tutor chats the tutor is shown: the most recently studied. */
const OTHER_CHATS_SHOWN = 5;

const RECORD_STATE: Record<LearningTopic['state'], string> = {
  done: 'done',
  current: 'in progress',
  ready: 'not started',
  locked: 'not started',
};

/** The learner's other tutor chats, so a new plan can continue one: its subject, and topics to carry over. */
function otherChatLines(records: readonly LearningRecord[]): string[] {
  const shown = [...records].sort((a, b) => b.studiedAt - a.studiedAt).slice(0, OTHER_CHATS_SHOWN);
  if (!shown.length) return [];
  return [
    "The learner's other tutor chats, most recently studied first. If your plan continues one, give it that chat's subject word for word, and set carriedFrom on each topic they already studied there:",
    ...shown.flatMap((record) => [
      `- [${record.chatId}] ${record.subject ? `${record.subject}: ` : ''}${record.goal}${record.finished ? ' (finished)' : ''}`,
      ...record.topics.map(
        (topic) =>
          `  - ${topic.name}: ${RECORD_STATE[topic.state]}${topic.percent != null ? `, ${topic.percent}%` : ''}${topic.dueForReview ? ', due for a refresher' : ''}`,
      ),
    ]),
  ];
}

function awaitingLine(state: TutorState): string | undefined {
  const open = state.awaiting;
  if (!open) return undefined;
  switch (open.kind) {
    case 'intake':
      return "Waiting on: the learner to answer your intake questions. If they would rather skip them, or answered in chat, don't wait: propose_plan from what you know, which closes the card.";
    case 'diagnostic':
      return "Waiting on: the learner to finish your diagnostic. No other card until they do. If they would rather skip it, don't wait: ask one quick thing in chat, then propose_plan from their answer, which closes the card.";
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
  /** The time of the request. Without it the block says nothing about time. */
  now?: number;
  /** When the conversation last moved before this message, to tell a return after a break. */
  lastExchangeAt?: number;
  /** From `learnerChangesSince`: shown last, as authoritative. */
  learnerChanges?: string[];
  /** The learner's other tutor chats, shown until this chat has a plan. */
  otherChats?: readonly LearningRecord[];
  /**
   * The log position `learnerChanges` starts from. Cards given after it came in
   * the tutor's last reply, and their answers are reported in `learnerChanges`;
   * listing them again as earlier questions reads as having asked them twice.
   */
  since?: number;
};

/** The tutor's view of the session, rendered fresh for every request. Plain text, short. */
export function renderStateBlock(state: TutorState, options: RenderOptions): string {
  const lines: string[] = ['Tutor state'];
  const plan = state.plan;
  const current = currentNode(state);
  const now = options.now;
  const due = now != null ? dueTopics(state, now) : [];
  const dueIds = new Set(due.map((schedule) => schedule.nodeId));
  if (now != null && options.lastExchangeAt != null) {
    const gap = now - options.lastExchangeAt;
    if (gap >= SITTING_GAP_MS) {
      lines.push(`Back after a break: the last exchange here was ${ago(gap)}.`);
    }
  }
  const before = options.since ?? Infinity;

  if (plan) {
    const done = plan.nodes.filter((n) => n.status === 'completed').length;
    lines.push(`Goal: ${plan.goal} (${done} of ${plan.nodes.length} topics done)`);
  }
  lines.push(`Phase: ${PHASE_LINE[state.phase]}`);

  if (current) {
    lines.push(`Current topic: ${current.name} [${current.id}]`);
    lines.push(`Objectives: ${current.objectives.join('; ')}`);
    const asked = askedOnTopic(state, current.id, before);
    if (asked.length) {
      lines.push(
        'Card questions on this topic so far, each asked once, the latest last, with how it went. Your next question uses a new case and new numbers:',
        ...asked,
      );
    }
    const shown = shownOnTopic(state, current.id);
    if (shown.length) {
      lines.push(
        'What their answers on this topic have shown so far, from your notes, the latest last. Take the next step from here:',
        ...shown,
      );
    }
    const later = laterTopicLines(state);
    if (later.length) {
      lines.push(
        'Coming up in the plan, with their own objectives. Teach these there, not inside the current topic; work the learner does on them is evidence for that topic:',
        ...later,
      );
    }
  } else if (state.phase === 'interlude') {
    const next = nextReadyNode(plan);
    if (next) lines.push(`Next in the plan: ${next.name} [${next.id}]`);
  }

  if (plan) {
    lines.push(
      `Topics (building < ${percent(PRACTISING)}%, practising ${percent(PRACTISING)}-${percent(READY) - 1}%, ready >= ${percent(READY)}%):`,
    );
    for (const node of plan.nodes) lines.push(topicLine(state, node, now, dueIds));
    if (due.length) {
      const name = (id: string) => plan.nodes.find((n) => n.id === id)?.name ?? id;
      lines.push(
        `Due for a refresher, studied a while ago and not practised since: ${due.map((s) => `${name(s.nodeId)} [${s.nodeId}]`).join(', ')}.`,
      );
    }
    const open = plan.nodes.flatMap((node) =>
      openMisconceptions(state, node.id).map(
        (m) =>
          `- ${m.id} on ${node.id}${m.occurrences > 1 ? ` (seen ${m.occurrences}x)` : ''}: ${m.description}`,
      ),
    );
    if (open.length) lines.push('Open misconceptions:', ...open);
    const cleared = (current ? (state.mastery[current.id]?.misconceptions ?? []) : []).filter(
      (m) => m.resolved,
    );
    if (cleared.length) {
      lines.push(
        `Cleared before on ${current!.id} (if one comes back, note it again with its id):`,
        ...cleared.map((m) => `- ${m.id}: ${m.description}`),
      );
    }
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
    lines.push(...otherChatLines(options.otherChats ?? []));
  }
  // Kept through teaching: the picks are what the first topics have to confront.
  const summaries = Object.values(state.diagnostics)
    .filter((diagnostic) => diagnostic.seq <= before)
    .map(diagnosticSummary)
    .filter((summary): summary is string => !!summary);
  lines.push(...summaries);
  if (plan && summaries.some((summary) => summary.includes('. Missed: '))) {
    lines.push(
      'A wrong belief those picks share is a misconception: if you have not noted it yet, note it on the topic it belongs to.',
    );
  }
  const heardBack =
    Object.values(state.intakes).some((i) => !!i.responses) ||
    Object.values(state.diagnostics).some((d) => !!d.answers);
  if (
    !plan &&
    !state.proposal &&
    state.awaiting?.kind !== 'diagnostic' &&
    heardBack &&
    !diagnosed(state) &&
    budgetsAllowDiagnostic(state)
  ) {
    lines.push(
      'No diagnostic yet. Unless they are new to the subject, see them try before you plan: give_diagnostic on the weak spot they named or the skill they claim, so the plan rests on what they do.',
    );
  }
  if (!plan && !state.proposal && heardBack) {
    const cap = percent(startingEstimateCap(state));
    lines.push(
      `Starting estimates: in propose_plan, give a startingEstimate (up to ${cap}%) with a one-line reason only to a topic these answers show the learner already knows, not to the topics built on it; the rest start at ${percent(MASTERY_PRIOR)}%.`,
    );
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
