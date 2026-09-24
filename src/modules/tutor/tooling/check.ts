// Module: tutor tooling check
// Responsibility: protocol health of a simulated session, asserted from its transcript and
// event log alone. `--check` fails the run when any of these fails.

import {
  MASTERY_EVIDENCE_MIN,
  READY,
  apply,
  confidenceOf,
  demonstratedEvidence,
  emptyTutorState,
  fold,
  openMisconceptions,
  percent,
  readyToComplete,
  type TutorEvent,
  type TutorState,
} from '@/modules/tutor/engine';
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
  /**
   * A topic the engine would let the tutor complete as mastered must be
   * closed within this many tutor turns of becoming so.
   */
  closeWithin: number;
};

export const DEFAULT_CHECK_OPTIONS: CheckOptions = { planWithin: 4, closeWithin: 3 };

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
  'already_recorded',
  'weight_against_kind',
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
    if (e.type !== 'evidence_recorded' || !(e.ref?.quizId || e.ref?.diagnosticId)) continue;
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
 * A reply that noted a misconception its answer showed gained nothing on the
 * topic: the answer that showed the misconception is not progress, whatever
 * else it got right. One an earlier answer showed leaves the reply's gain
 * standing. Measured on the estimate, from the reply's own evidence.
 */
function noGainWithMisconception(run: SimulationRun): CheckResult {
  const problems: string[] = [];
  const moved = new Map<string, number>();
  const noted = new Set<string>();
  let state = emptyTutorState();
  for (const event of [...run.events].sort((a, b) => a.seq - b.seq)) {
    const before = state;
    state = apply(state, event);
    if (event.by !== 'tutor' || !event.messageId) continue;
    const key = `${event.messageId} on ${'nodeId' in event ? event.nodeId : ''}`;
    if (event.type === 'misconception_noted' && event.shownBy !== 'earlier_answer') noted.add(key);
    if (event.type !== 'evidence_recorded') continue;
    const delta =
      (state.mastery[event.nodeId]?.confidence ?? 0) -
      (before.mastery[event.nodeId]?.confidence ?? 0);
    moved.set(key, (moved.get(key) ?? 0) + delta);
  }
  for (const key of noted) {
    const gain = moved.get(key) ?? 0;
    if (gain > 0.005) problems.push(`reply ${key}: +${Math.round(gain * 100)} points`);
  }
  return result(
    'no_gain_with_misconception',
    problems,
    'No reply gained on a topic it noted a misconception on.',
  );
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

/** The topic in progress, when the engine would accept completing it as mastered. */
function readyTopic(state: TutorState): string | undefined {
  const id = state.currentNodeId;
  return id && state.phase === 'teaching' && readyToComplete(state, id) ? id : undefined;
}

function standing(state: TutorState, nodeId: string): string {
  const open = openMisconceptions(state, nodeId).length;
  return `${nodeId} at ${percent(confidenceOf(state, nodeId))}% on ${demonstratedEvidence(state, nodeId)} of the learner's own answers${open ? `, ${open} open misconception(s)` : ''}`;
}

/**
 * Judges the tutor, not the student. A tutor turn that ends with the topic in
 * progress ready to complete as mastered (the engine's own rule) and leaves it
 * open is a chance passed up; `within` of them in a row on one topic is a
 * stall. Judged at the end of the turn, after the tutor recorded what the
 * learner's latest message showed, so a slip that keeps the topic open is not
 * held against it. A student who keeps erring never gets a topic there, which
 * says nothing about the tutor, so that run is not judged.
 */
function topicClosedWhenReady(run: SimulationRun, within: number): CheckResult {
  const id = 'topic_closed_when_ready';
  const problems: string[] = [];
  const closed: string[] = [];
  let streak: { nodeId: string; from: number; turns: number } | undefined;
  let state: TutorState | undefined;
  for (const x of run.exchanges) {
    state = fold(run.events.filter((e) => e.seq <= x.after.lastSeq));
    for (const e of run.events) {
      if (
        e.type === 'topic_completed' &&
        e.how === 'mastered' &&
        e.messageId === x.tutor.messageId
      ) {
        closed.push(`${e.nodeId} in #${x.index}`);
      }
    }
    const nodeId = readyTopic(state);
    if (!nodeId) {
      streak = undefined;
      continue;
    }
    streak =
      streak?.nodeId === nodeId
        ? { ...streak, turns: streak.turns + 1 }
        : { nodeId, from: x.index, turns: 1 };
    if (streak.turns === within) {
      problems.push(
        `${nodeId} could be completed from #${streak.from} (${standing(state, nodeId)}), and was still open after #${x.index}`,
      );
    }
  }
  const done = closed.length ? ` Closed: ${closed.join(', ')}.` : '';
  if (problems.length) {
    return result(
      id,
      problems,
      `A topic ready to complete must be closed within ${within} tutor turns.${done}`,
    );
  }
  if (streak) {
    return skipped(
      id,
      `Too short to judge: ${streak.nodeId} could be completed from #${streak.from}; the tutor gets ${within} turns to close it.${done}`,
    );
  }
  if (closed.length) {
    return result(
      id,
      [],
      `Every topic ready to complete was closed within ${within} turns.${done}`,
    );
  }
  const current = state?.currentNodeId;
  return skipped(
    id,
    `Not judged: no topic reached ${percent(READY)}% on ${MASTERY_EVIDENCE_MIN} of the learner's own answers with no open misconception (the student is still learning, or the run is short)${state && current ? `; at the end, ${standing(state, current)}` : ''}.`,
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
    noGainWithMisconception(run),
    noAnswerKeysReplayed(run),
    planApprovedWithin(run, options.planWithin),
    topicClosedWhenReady(run, options.closeWithin),
  ];
}
