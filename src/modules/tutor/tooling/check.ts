// Module: tutor tooling check
// Responsibility: protocol health of a simulated session, asserted from its transcript and
// event log alone. `--check` fails the run when any of these fails.

import { apply, emptyTutorState, type TutorEvent } from '@/modules/tutor/engine';
import type { ExchangeRecord, SimulationRun } from '@/modules/tutor/tooling/simulation';

export type CheckResult = {
  id: string;
  ok: boolean;
  /** Not enough of the session ran to judge; counts as passing. */
  skipped?: boolean;
  summary: string;
  problems: string[];
};

export type CheckOptions = {
  /** The plan must be approved within this many exchanges. */
  planWithin: number;
  /** At least one topic must be completed within this many exchanges. */
  topicWithin: number;
};

export const DEFAULT_CHECK_OPTIONS: CheckOptions = { planWithin: 4, topicWithin: 10 };

/**
 * Refusals whose hint tells the tutor to do something else rather than retry:
 * heeding one without looping on it is a recovery.
 */
const ADVISORY_ERRORS = new Set([
  'wrong_phase',
  'card_open',
  'budget_exhausted',
  'not_editable',
  'not_ready',
  'open_misconceptions',
  'already_current',
  'nothing_to_change',
]);

const CARD_EVENT = {
  intake: 'intake_asked',
  diagnostic: 'diagnostic_given',
  quiz: 'quiz_given',
  proposal: 'plan_proposed',
} as const;

const CARD_ANSWER = {
  intake: ['answer_intake'],
  diagnostic: ['answer_diagnostic'],
  quiz: ['answer_quiz_item'],
  proposal: ['approve_plan', 'decline_plan'],
} as const;

function result(id: string, problems: string[], summary: string): CheckResult {
  return { id, ok: problems.length === 0, summary, problems };
}

function skipped(id: string, summary: string): CheckResult {
  return { id, ok: true, skipped: true, summary, problems: [] };
}

function turnsCompleted(run: SimulationRun): CheckResult {
  const problems = run.exchanges
    .filter((x) => x.tutor.error)
    .map((x) => `#${x.index}: the turn failed: ${x.tutor.error}`);
  return result('turns_completed', problems, 'Every tutor turn ran to its end.');
}

function stateBlockEveryRequest(run: SimulationRun): CheckResult {
  const problems: string[] = [];
  for (const x of run.exchanges) {
    if (!x.tutor.requests.length && !x.tutor.error) {
      problems.push(`#${x.index}: no request reached the model`);
    }
    for (const request of x.tutor.requests) {
      const block = request.stateBlock ?? '';
      if (!block.includes('Phase: ')) {
        problems.push(`#${x.index} round ${request.round}: no state block in the system prompt`);
      }
    }
  }
  return result('state_block_every_request', problems, 'Every request carried the state block.');
}

function toolErrorsRecovered(run: SimulationRun): CheckResult {
  const problems: string[] = [];
  for (const x of run.exchanges) {
    const calls = x.tutor.toolCalls;
    calls.forEach((call, i) => {
      if (call.ok) return;
      const later = calls.slice(i + 1);
      if (later.some((c) => c.name === call.name && c.ok)) return;
      const code = call.code ?? 'error';
      const repeated = later.some((c) => c.name === call.name && !c.ok && c.code === call.code);
      if (ADVISORY_ERRORS.has(code) && !repeated) return;
      problems.push(
        `#${x.index}: ${call.name} failed (${code})${repeated ? ' and was retried unchanged' : ' and was never fixed'}`,
      );
    });
    for (const name of x.tutor.droppedCalls) {
      problems.push(`#${x.index}: ${name} was not run (dropped by the scheduler)`);
    }
  }
  return result(
    'tool_errors_recovered',
    problems,
    'Every failed tool call was fixed, or its advice heeded, in the same turn.',
  );
}

function learnerCommandsOk(run: SimulationRun): CheckResult {
  const problems: string[] = [];
  for (const x of run.exchanges) {
    for (const a of [...x.student.actions, ...x.quietEdits]) {
      if (!a.ok && a.action.type !== 'adjust_mastery' && a.action.type !== 'mark_known') {
        problems.push(
          `#${x.index}: ${a.action.type} was refused (${a.error?.code}: ${a.error?.message})`,
        );
      }
    }
  }
  return result(
    'learner_commands_ok',
    problems,
    'Every card action the learner took was accepted.',
  );
}

/**
 * A card open at the end of a turn must be one the learner can see and
 * answer: its event is on a message of the transcript, its items are
 * well-formed, and the learner's next move answered it.
 */
function cardsAnswerable(run: SimulationRun): CheckResult {
  const problems: string[] = [];
  const messageIds = new Set(run.exchanges.map((x) => x.tutor.messageId));
  run.exchanges.forEach((x, i) => {
    const open = x.after.awaiting;
    if (!open) return;
    const given = run.events.find((e) => {
      if (e.type !== CARD_EVENT[open.kind]) return false;
      switch (e.type) {
        case 'intake_asked':
          return e.intakeId === open.id;
        case 'diagnostic_given':
          return e.diagnosticId === open.id;
        case 'quiz_given':
          return e.quizId === open.id;
        case 'plan_proposed':
          return e.proposalId === open.id;
        default:
          return false;
      }
    });
    if (!given) {
      problems.push(`#${x.index}: the open ${open.kind} has no event behind it`);
      return;
    }
    if (!given.messageId || !messageIds.has(given.messageId)) {
      problems.push(`#${x.index}: the open ${open.kind} is not attached to a tutor message`);
    }
    if (given.type === 'quiz_given' || given.type === 'diagnostic_given') {
      for (const item of given.items) {
        const keyed = typeof item.correct !== 'number' || item.correct < item.choices.length;
        if (item.choices.length < 2 || !keyed) {
          problems.push(`#${x.index}: ${open.kind} item ${item.id} cannot be answered`);
        }
      }
    }
    const next: ExchangeRecord | undefined = run.exchanges[i + 1];
    if (!next) return;
    const answers = CARD_ANSWER[open.kind] as readonly string[];
    const answered = next.student.actions.some((a) => a.ok && answers.includes(a.action.type));
    if (!answered) problems.push(`#${x.index}: the learner could not answer the open ${open.kind}`);
  });
  return result(
    'cards_answerable',
    problems,
    'Every card left open at the end of a turn was on screen and answered.',
  );
}

function evidenceOncePerAnswer(run: SimulationRun): CheckResult {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  for (const e of run.events) {
    if (e.type !== 'evidence_recorded' || !e.ref) continue;
    if (e.source !== 'quiz' && e.source !== 'diagnostic') {
      problems.push(`seq ${e.seq}: ${e.source} evidence points at a card answer`);
    }
    const key = `${e.ref.quizId ?? e.ref.diagnosticId}:${e.ref.itemId}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  for (const [key, count] of seen) {
    if (count > 1) problems.push(`${key}: ${count} evidence events for one answer`);
  }
  const quizNode = new Map<string, string>();
  for (const e of run.events) {
    if (e.type === 'quiz_given') quizNode.set(e.quizId, e.nodeId);
    if (e.type !== 'quiz_answered') continue;
    // The engine scores an answer only against a topic the learner model tracks.
    const tracked = !!run.state.mastery[quizNode.get(e.quizId) ?? ''];
    if (tracked && !seen.has(`${e.quizId}:${e.itemId}`)) {
      problems.push(`${e.quizId}:${e.itemId}: a quiz answer recorded no evidence`);
    }
  }
  return result(
    'evidence_once_per_answer',
    problems,
    'Each quiz or diagnostic answer produced exactly one evidence event, from the engine.',
  );
}

function masteryInRange(run: SimulationRun): CheckResult {
  const problems: string[] = [];
  let state = emptyTutorState();
  for (const event of [...run.events].sort((a, b) => a.seq - b.seq)) {
    state = apply(state, event);
    for (const [nodeId, m] of Object.entries(state.mastery)) {
      if (!Number.isFinite(m.confidence) || m.confidence < 0 || m.confidence > 1) {
        problems.push(`seq ${event.seq}: ${nodeId} at ${m.confidence}`);
      }
    }
  }
  return result('mastery_in_range', problems, 'Mastery stayed within [0, 1] after every event.');
}

/**
 * The exchange an event belongs to (1-based): the turn that produced it, or,
 * for a learner's action between turns, the turn the learner was answering.
 */
function exchangeOf(run: SimulationRun, match: (e: TutorEvent) => boolean): number | undefined {
  const event = run.events.find(match);
  if (!event) return undefined;
  const turn = run.exchanges.find((x) => x.after.lastSeq >= event.seq);
  if (!turn) return run.exchanges.length;
  return event.by === 'learner' ? turn.index - 1 : turn.index;
}

function planApprovedWithin(run: SimulationRun, within: number): CheckResult {
  const id = 'plan_approved_within';
  const at = exchangeOf(run, (e) => e.type === 'plan_approved');
  if (at !== undefined && at <= within) {
    return result(id, [], `The plan was approved after exchange ${at} (limit ${within}).`);
  }
  if (run.exchanges.length < within + 1 && at === undefined) {
    return skipped(id, `Too short to judge: the plan gets ${within} exchanges.`);
  }
  return result(
    id,
    [at === undefined ? 'no plan was approved' : `approved only after exchange ${at}`],
    `The plan must be approved within ${within} exchanges.`,
  );
}

function topicCompletedWithin(run: SimulationRun, within: number): CheckResult {
  const id = 'topic_completed_within';
  const at = exchangeOf(run, (e) => e.type === 'topic_completed');
  if (at !== undefined && at <= within) {
    return result(id, [], `A topic was completed in exchange ${at} (limit ${within}).`);
  }
  if (run.exchanges.length < within && at === undefined) {
    return skipped(id, `Too short to judge: a topic gets ${within} exchanges.`);
  }
  return result(
    id,
    [at === undefined ? 'no topic was completed' : `first completed only in exchange ${at}`],
    `At least one topic must be completed within ${within} exchanges.`,
  );
}

function noAnswerKeysReplayed(run: SimulationRun): CheckResult {
  const problems: string[] = [];
  for (const x of run.exchanges) {
    for (const request of x.tutor.requests) {
      if (request.answerKeyLeaks > 0) {
        problems.push(
          `#${x.index} round ${request.round}: ${request.answerKeyLeaks} replayed call(s) carry an answer key`,
        );
      }
    }
  }
  return result(
    'no_answer_keys_replayed',
    problems,
    'Replayed history never carried an answer key.',
  );
}

export function checkRun(
  run: SimulationRun,
  options: CheckOptions = DEFAULT_CHECK_OPTIONS,
): CheckResult[] {
  return [
    turnsCompleted(run),
    stateBlockEveryRequest(run),
    toolErrorsRecovered(run),
    cardsAnswerable(run),
    learnerCommandsOk(run),
    evidenceOncePerAnswer(run),
    masteryInRange(run),
    noAnswerKeysReplayed(run),
    planApprovedWithin(run, options.planWithin),
    topicCompletedWithin(run, options.topicWithin),
  ];
}
