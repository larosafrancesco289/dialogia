// Module: tutor engine command gate
// Responsibility: whether a tutor tool may be called in a state at all, before its arguments are looked at: phase, open card, flags and budget.

import type { TutorFlags } from '@/modules/tutor/engine/flags';
import { remainingBudgets, type TutorPhase, type TutorState } from '@/modules/tutor/engine/state';
import { PHASE_HINT, err } from '@/modules/tutor/engine/commands/shared';
import type { TutorError, TutorToolName } from '@/modules/tutor/engine/commands/types';

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

/**
 * Whether a tutor tool may be called in this state at all, before its
 * arguments are looked at. `availableTutorTools` offers exactly the tools
 * this allows.
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
  // A plan proposal closes an unanswered intake: a learner who would rather
  // skip the questions, or answered them in chat, is not kept waiting on them.
  const supersedes = tool === 'propose_plan' && open?.kind === 'intake';
  if (CARD_TOOLS.has(tool) && open && open.kind !== 'proposal' && !supersedes) {
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
