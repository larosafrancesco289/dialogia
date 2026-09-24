// Module: tutor tooling simulation
// Responsibility: one simulated session. The tutor runs through the real pipeline; after each
// turn the student acts as the learner would in the UI: answers the open card through learner
// commands and sends the UI's message, chooses at a chapter break, or types a reply.

import type { Usage } from '@/lib/api/normalizers';
import type { LearningPlan } from '@/lib/types';
import {
  nextReadyNode,
  percent,
  type Awaiting,
  type TutorError,
  type TutorEvent,
  type TutorFlags,
  type TutorState,
} from '@/modules/tutor/engine';
import { LEDGER } from '@/modules/tutor/lib/ledger';
import { matchKnown } from '@/modules/tutor/tooling/scenarios';
import type {
  HeadlessTutorSession,
  LearnerAction,
  RequestRecord,
  TurnRecord,
} from '@/modules/tutor/tooling/session';
import type { SimulatedStudent } from '@/modules/tutor/tooling/student';

export type ToolCallRecord = {
  round?: number;
  name: string;
  ok: boolean;
  args: Record<string, unknown>;
  result?: Record<string, unknown>;
  /** The engine's error code, when the call was refused. */
  code?: string;
};

export type LearnerActionRecord = {
  action: LearnerAction;
  ok: boolean;
  error?: Pick<TutorError, 'code' | 'message'>;
  /** What the student meant, e.g. which gap drove a wrong answer. */
  note?: string;
};

export type StudentTurn = {
  /** `ledger`: the ledger line the UI sends for a card or chapter-break action. */
  kind: 'typed' | 'ledger';
  text: string;
  actions: LearnerActionRecord[];
};

export type ExchangeRecord = {
  index: number;
  student: StudentTurn;
  tutor: {
    messageId: string;
    text: string;
    toolCalls: ToolCallRecord[];
    droppedCalls: string[];
    requests: RequestRecord[];
    eventTypes: string[];
    usage?: { promptTokens?: number; completionTokens?: number; cost?: number };
    error?: string;
  };
  after: {
    phase: TutorState['phase'];
    /** The log position after the turn. */
    lastSeq: number;
    awaiting?: Awaiting;
    currentTopic?: string;
    topicsDone: number;
    topicsTotal: number;
    mastery: Record<string, number>;
  };
  /** Quiet learner edits made after this turn (only with learner edits on). */
  quietEdits: LearnerActionRecord[];
};

export type SimulationMeta = {
  scenario: string;
  title: string;
  tutorModel: string;
  studentModel: string;
  flags: TutorFlags;
  learnerEdits: boolean;
  seed: number;
  exchanges: number;
  startedAt: string;
  durationMs: number;
  /** The student's error rate per gap at the end (it falls with each quiz on the gap). */
  errorRates: Record<string, number>;
};

export type SimulationRun = {
  meta: SimulationMeta;
  exchanges: ExchangeRecord[];
  /** The chat's whole tutor event log. */
  events: TutorEvent[];
  /** `fold(events)`: the session as the engine sees it at the end. */
  state: TutorState;
};

export type SimulationOptions = {
  session: HeadlessTutorSession;
  student: SimulatedStudent;
  exchanges: number;
  flags: TutorFlags;
  meta: Pick<SimulationMeta, 'tutorModel' | 'studentModel' | 'seed'>;
  /** Let the student quietly mark topics known or move estimates (study conditions). */
  learnerEdits?: boolean;
  /** Plan declines before the student approves whatever comes. */
  maxDeclines?: number;
  onExchange?: (exchange: ExchangeRecord) => void;
};

function summarizeTurn(turn: TurnRecord): ExchangeRecord['tutor'] {
  const usage = turn.assistant.usage as Usage | undefined;
  return {
    messageId: turn.assistant.id,
    text: turn.assistant.content,
    toolCalls: (turn.assistant.toolCalls ?? []).map((entry) => {
      const code = entry.output?.error;
      return {
        ...(typeof entry.metadata?.round === 'number' ? { round: entry.metadata.round } : {}),
        name: entry.name,
        ok: entry.status === 'success',
        args: entry.input,
        ...(entry.output ? { result: entry.output } : {}),
        ...(entry.status !== 'success' && typeof code === 'string' ? { code } : {}),
      };
    }),
    droppedCalls: turn.droppedCalls,
    requests: turn.requests,
    eventTypes: turn.events.map((e) => e.type),
    ...(usage
      ? {
          usage: {
            promptTokens: usage.prompt_tokens ?? usage.input_tokens,
            completionTokens: usage.completion_tokens ?? usage.output_tokens,
            ...(typeof usage.cost === 'number' ? { cost: usage.cost } : {}),
          },
        }
      : {}),
    ...(turn.error ? { error: turn.error } : {}),
  };
}

function snapshot(state: TutorState): ExchangeRecord['after'] {
  const nodes = state.plan?.nodes ?? [];
  return {
    phase: state.phase,
    lastSeq: state.lastSeq,
    ...(state.awaiting ? { awaiting: state.awaiting } : {}),
    ...(state.currentNodeId ? { currentTopic: state.currentNodeId } : {}),
    topicsDone: nodes.filter((n) => n.status === 'completed').length,
    topicsTotal: nodes.length,
    mastery: Object.fromEntries(
      nodes.map((n) => [n.id, percent(state.mastery[n.id]?.confidence ?? 0)]),
    ),
  };
}

function nodeText(plan: LearningPlan | undefined, nodeId: string | undefined): string {
  const node = plan?.nodes.find((n) => n.id === nodeId);
  if (!node) return nodeId ?? '';
  return [node.id, node.name, node.description ?? '', ...node.objectives].join(' ');
}

/** The side panel as the learner sees it: the plan, and the estimates when they are shown. */
export function panelView(state: TutorState, flags: TutorFlags): string | undefined {
  const plan = state.plan;
  if (!plan) return undefined;
  const lines = plan.nodes.map((node, i) => {
    const status =
      node.status === 'completed'
        ? 'done'
        : node.status === 'in_progress'
          ? 'in progress'
          : 'not started';
    const estimate = flags.learnerModelVisible
      ? `, ${percent(state.mastery[node.id]?.confidence ?? 0)}%`
      : '';
    return `${i + 1}. ${node.name} [${node.id}]: ${status}${estimate}`;
  });
  return [`Plan: ${plan.goal}`, ...lines].join('\n');
}

function cardView(state: TutorState): string | undefined {
  const open = state.awaiting;
  if (!open) return undefined;
  switch (open.kind) {
    case 'intake':
      return `An intake card with ${state.intakes[open.id]?.questions.length ?? 0} questions.`;
    case 'diagnostic': {
      const d = state.diagnostics[open.id];
      return d ? `A diagnostic on ${d.topic}:\n${itemsView(d.items)}` : undefined;
    }
    case 'quiz': {
      const q = state.quizzes[open.id];
      return q ? `A quiz:\n${itemsView(q.items)}` : undefined;
    }
    case 'proposal':
      return 'A plan proposal card with Approve and Request changes buttons.';
  }
}

function itemsView(items: Array<{ question: string; choices: string[] }>): string {
  return items
    .map(
      (item, i) =>
        `${i + 1}. ${item.question}\n${item.choices.map((c, j) => `   ${String.fromCharCode(65 + j)}. ${c}`).join('\n')}`,
    )
    .join('\n');
}

function lastCompleted(events: readonly TutorEvent[]) {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    const event = events[i];
    if (event.type === 'topic_completed') return event;
  }
  return undefined;
}

export async function runSimulation(options: SimulationOptions): Promise<SimulationRun> {
  const { session, student, flags } = options;
  const maxDeclines = options.maxDeclines ?? 1;
  const started = Date.now();
  const exchanges: ExchangeRecord[] = [];
  let declines = 0;
  let editsCheckedAt = -1;

  const act = async (
    actions: LearnerActionRecord[],
    action: LearnerAction,
    messageId?: string,
    note?: string,
  ): Promise<boolean> => {
    const result = await session.learner(action, messageId);
    actions.push({
      action,
      ok: result.ok,
      ...(result.ok ? {} : { error: { code: result.error.code, message: result.error.message } }),
      ...(note ? { note } : {}),
    });
    return result.ok;
  };

  const ledger = (line: string, actions: LearnerActionRecord[]): StudentTurn => {
    student.did(line);
    return { kind: 'ledger', text: line, actions };
  };

  const typed = async (actions: LearnerActionRecord[], text?: string): Promise<StudentTurn> => {
    if (text) student.did(text);
    return { kind: 'typed', text: text ?? (await student.reply()), actions };
  };

  /** The open card, answered the way its component answers it. */
  const answerCard = async (
    state: TutorState,
    open: Awaiting,
  ): Promise<StudentTurn | undefined> => {
    const actions: LearnerActionRecord[] = [];
    switch (open.kind) {
      case 'intake': {
        const intake = state.intakes[open.id];
        if (!intake) return undefined;
        const responses = await student.answerIntake(intake.questions);
        const ok = await act(
          actions,
          { type: 'answer_intake', intakeId: intake.intakeId, responses },
          intake.messageId,
        );
        return ok ? ledger(LEDGER.intakeAnswered(), actions) : typed(actions);
      }
      case 'diagnostic': {
        const diagnostic = state.diagnostics[open.id];
        if (!diagnostic) return undefined;
        const answers: Record<string, number> = {};
        const notes: string[] = [];
        for (const item of diagnostic.items) {
          const topic = item.nodeId ? nodeText(state.plan, item.nodeId) : diagnostic.topic;
          const answer = student.answerChoice(item, topic);
          answers[item.id] = answer.choice;
          notes.push(`${item.id}=${answer.choice}${answer.gap ? ` (gap: ${answer.gap})` : ''}`);
        }
        const ok = await act(
          actions,
          { type: 'answer_diagnostic', diagnosticId: diagnostic.diagnosticId, answers },
          diagnostic.messageId,
          notes.join(', '),
        );
        if (!ok) return typed(actions);
        const scored = diagnostic.items.filter((i) => typeof i.correct === 'number');
        const right = scored.filter((i) => answers[i.id] === i.correct).length;
        return ledger(LEDGER.diagnosticFinished(right, scored.length), actions);
      }
      case 'quiz': {
        const quiz = state.quizzes[open.id];
        if (!quiz) return undefined;
        const gaps = new Set<string>();
        let failed = false;
        for (const item of quiz.items) {
          if (quiz.answers[item.id]) continue;
          const answer = student.answerChoice(item, nodeText(state.plan, quiz.nodeId));
          if (answer.gap) gaps.add(answer.gap);
          const ok = await act(
            actions,
            {
              type: 'answer_quiz_item',
              quizId: quiz.quizId,
              itemId: item.id,
              choice: answer.choice,
            },
            quiz.messageId,
            `${answer.correct ? 'right' : 'wrong'}${answer.gap ? ` (gap: ${answer.gap})` : ''}`,
          );
          if (!ok) failed = true;
        }
        for (const gap of gaps) student.practised(gap);
        const after = session.tutor().state.quizzes[quiz.quizId];
        if (failed || !after) return typed(actions);
        const right = after.items.filter((item) => after.answers[item.id]?.correct).length;
        return ledger(LEDGER.quizFinished(right, after.items.length), actions);
      }
      case 'proposal': {
        const proposal = state.proposal;
        if (!proposal) return undefined;
        const canDecline = flags.planEditable && declines < maxDeclines;
        const decision = await student.reviewProposal(
          proposal.plan,
          proposal.rationale,
          canDecline,
        );
        if (!decision.approve && decision.feedback) {
          declines += 1;
          const ok = await act(
            actions,
            { type: 'decline_plan', proposalId: proposal.proposalId, feedback: decision.feedback },
            proposal.messageId,
          );
          return ok ? ledger(LEDGER.planDeclined(decision.feedback), actions) : typed(actions);
        }
        const ok = await act(
          actions,
          { type: 'approve_plan', proposalId: proposal.proposalId },
          proposal.messageId,
        );
        return ok ? ledger(LEDGER.planApproved(), actions) : typed(actions);
      }
    }
  };

  /** The live chapter break (only when the plan is editable, as in the UI). */
  const atChapterBreak = async (state: TutorState): Promise<StudentTurn | undefined> => {
    const completed = lastCompleted(session.tutor().events);
    const node = state.plan?.nodes.find((n) => n.id === completed?.nodeId);
    if (!completed || !node) return undefined;
    const next = nextReadyNode(state.plan);
    const estimate = flags.learnerModelVisible
      ? percent(state.mastery[node.id]?.confidence ?? 0)
      : undefined;
    const choice = await student.atChapterBreak(node.name, next?.name, estimate);
    const actions: LearnerActionRecord[] = [];
    if (choice.choice === 'type') return typed(actions, choice.message);
    if (choice.choice === 'more_practice') {
      if (await act(actions, { type: 'more_practice', nodeId: node.id })) {
        return ledger(LEDGER.morePractice(node.name), actions);
      }
      return typed(actions);
    }
    if (!next) return typed(actions);
    if (await act(actions, { type: 'start_topic', nodeId: next.id })) {
      return ledger(LEDGER.goingOn(next.name), actions);
    }
    return typed(actions);
  };

  const quietEdits = async (state: TutorState): Promise<LearnerActionRecord[]> => {
    const actions: LearnerActionRecord[] = [];
    const view = panelView(state, flags);
    if (!view || state.awaiting || state.lastSeq === editsCheckedAt) return actions;
    editsCheckedAt = state.lastSeq;
    const edits = await student.quietEdits(view, flags.planEditable, flags.learnerModelEditable);
    for (const edit of edits) {
      const node = state.plan?.nodes.find((n) => n.id === edit.topicId);
      if (!node) continue;
      if (edit.action === 'mark_known') {
        // The scenario, not the student model's mood, decides what it already knows.
        if (!matchKnown(student.scenario, nodeText(state.plan, node.id))) continue;
        await act(actions, { type: 'mark_known', nodeId: node.id });
      } else {
        await act(actions, {
          type: 'adjust_mastery',
          nodeId: node.id,
          setTo: Math.round(edit.to) / 100,
          note: `You set this to ${Math.round(edit.to)}%.`,
        });
      }
    }
    return actions;
  };

  let move: StudentTurn = { kind: 'typed', text: await student.opening(), actions: [] };
  for (let index = 1; index <= options.exchanges; index += 1) {
    const turn = await session.runTurn(move.text, { ledger: move.kind === 'ledger' });
    const state = session.tutor().state;
    const record: ExchangeRecord = {
      index,
      student: move,
      tutor: summarizeTurn(turn),
      after: snapshot(state),
      quietEdits: [],
    };
    exchanges.push(record);
    if (turn.error || index === options.exchanges) {
      options.onExchange?.(record);
      break;
    }

    const panel = panelView(state, flags);
    const card = cardView(state);
    student.hear(turn.assistant.content, [card, panel].filter(Boolean).join('\n\n') || undefined);
    if (options.learnerEdits) record.quietEdits = await quietEdits(state);

    const current = session.tutor().state;
    move =
      (current.awaiting ? await answerCard(current, current.awaiting) : undefined) ??
      (current.phase === 'interlude' && flags.planEditable
        ? await atChapterBreak(current)
        : undefined) ??
      (await typed([]));
    options.onExchange?.(record);
  }

  const final = session.tutor();
  return {
    meta: {
      scenario: student.scenario.id,
      title: student.scenario.title,
      tutorModel: options.meta.tutorModel,
      studentModel: options.meta.studentModel,
      flags,
      learnerEdits: !!options.learnerEdits,
      seed: options.meta.seed,
      exchanges: exchanges.length,
      startedAt: new Date(started).toISOString(),
      durationMs: Date.now() - started,
      errorRates: student.errorRates(),
    },
    exchanges,
    events: final.events,
    state: final.state,
  };
}
