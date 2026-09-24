// Module: tutor engine commands
// Responsibility: `decide` and `step`. This directory is the only place a tutor rule or precondition is checked: the gate (gate.ts), then the tutor's half (tutor.ts) or the learner's (learner.ts). Commands in, events or a structured error out.

import { apply } from '@/modules/tutor/engine/fold';
import type { TutorState } from '@/modules/tutor/engine/state';
import { decideLearner } from '@/modules/tutor/engine/commands/learner';
import { Emitter } from '@/modules/tutor/engine/commands/shared';
import { decideTutor } from '@/modules/tutor/engine/commands/tutor';
import type {
  CommandContext,
  DecideResult,
  StepResult,
  TutorCommand,
} from '@/modules/tutor/engine/commands/types';

export { gateTutorTool } from '@/modules/tutor/engine/commands/gate';
export type * from '@/modules/tutor/engine/commands/types';

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
