// Module: tutor engine test support
// Responsibility: a deterministic session harness (fixed clock, counting ids) for the engine's tests.

import assert from 'node:assert/strict';
import {
  decide,
  type CommandContext,
  type DecideResult,
  type LearnerCommand,
  type TutorCommand,
  type TutorError,
  type TutorToolCommand,
} from '@/modules/tutor/engine/commands';
import type { TutorEvent } from '@/modules/tutor/engine/events';
import { DEFAULT_TUTOR_FLAGS, type TutorFlags } from '@/modules/tutor/engine/flags';
import { apply } from '@/modules/tutor/engine/fold';
import type { PlanInput } from '@/modules/tutor/engine/plan';
import { emptyTutorState, type TutorState } from '@/modules/tutor/engine/state';

/** Distributes Omit over a union, so a command can be written without its `by`. */
type WithoutBy<T> = T extends unknown ? Omit<T, 'by'> : never;

export type Harness = {
  flags: TutorFlags;
  readonly state: TutorState;
  readonly events: TutorEvent[];
  ctx(messageId?: string): CommandContext;
  /** Decides and applies; fails the test on an error. */
  tutor(command: WithoutBy<TutorToolCommand>, messageId?: string): TutorEvent[];
  learner(command: WithoutBy<LearnerCommand>, messageId?: string): TutorEvent[];
  /** Decides only; expects an error and returns it. */
  refuse(command: TutorCommand): TutorError;
  decide(command: TutorCommand): DecideResult;
};

export function harness(flags: Partial<TutorFlags> = {}): Harness {
  let ids = 0;
  let clock = 1_000;
  let state = emptyTutorState();
  const events: TutorEvent[] = [];

  const h: Harness = {
    flags: { ...DEFAULT_TUTOR_FLAGS, ...flags },
    get state() {
      return state;
    },
    events,
    ctx(messageId) {
      clock += 1_000;
      return {
        chatId: 'chat-1',
        at: clock,
        idFactory: () => `id-${++ids}`,
        flags: h.flags,
        ...(messageId ? { messageId } : {}),
      };
    },
    tutor(command, messageId) {
      return run({ ...command, by: 'tutor' } as TutorCommand, messageId);
    },
    learner(command, messageId) {
      return run({ ...command, by: 'learner' } as TutorCommand, messageId);
    },
    refuse(command) {
      const result = decide(state, command, h.ctx());
      assert.equal(result.ok, false, `expected ${command.type} to be refused`);
      return (result as { ok: false; error: TutorError }).error;
    },
    decide(command) {
      return decide(state, command, h.ctx());
    },
  };

  function run(command: TutorCommand, messageId?: string): TutorEvent[] {
    const result = decide(state, command, h.ctx(messageId));
    if (!result.ok) {
      assert.fail(`${command.type} refused: ${result.error.code}: ${result.error.message}`);
    }
    for (const event of result.events) {
      state = apply(state, event);
      events.push(event);
    }
    return result.events;
  }

  return h;
}

/** Limits -> derivatives -> chain rule, a straight line. */
export const CALCULUS: PlanInput = {
  goal: 'Differentiate composite functions',
  nodes: [
    { id: 'limits', name: 'Limits', objectives: ['Evaluate simple limits'] },
    {
      id: 'derivatives',
      name: 'Derivatives',
      objectives: ['Define the derivative', 'Apply the power rule'],
      prerequisites: ['limits'],
    },
    {
      name: 'Chain rule',
      objectives: ['Differentiate composite functions'],
      prerequisites: ['Derivatives'],
    },
  ],
};

/** A harness with CALCULUS proposed and approved, so Limits is in progress. */
export function teaching(flags: Partial<TutorFlags> = {}): Harness {
  const h = harness(flags);
  h.tutor({ type: 'propose_plan', ...CALCULUS });
  h.learner({ type: 'approve_plan', proposalId: h.state.proposal!.proposalId });
  return h;
}

export const QUIZ_ITEMS = [
  { question: 'lim x->0 of x?', choices: ['0', '1'], correct: 0 },
  { question: 'lim x->1 of 2x?', choices: ['1', '2', '3'], correct: 1 },
  { question: 'lim x->2 of x^2?', choices: ['2', '4'], correct: 1 },
];

/** Raises the current topic past READY by answering a full quiz correctly. */
export function master(h: Harness) {
  h.tutor({ type: 'give_quiz', items: QUIZ_ITEMS });
  const quizId = h.state.awaiting!.id;
  QUIZ_ITEMS.forEach((item, i) =>
    h.learner({ type: 'answer_quiz_item', quizId, itemId: `q${i + 1}`, choice: item.correct }),
  );
}
