import type { ToolCall, TutorToolName } from '@/lib/agent/types';
import type { TutorPhase, TutorToolPolicy } from '@/lib/agent/tutor/state';
import { getTutorToolsByTag } from '@/lib/tools/registry';
import { schedulePlanningToolCalls } from '@/lib/agent/tools/scheduler';

const QUIZ_TOOL_NAMES = new Set<TutorToolName>(getTutorToolsByTag('quiz'));

export function isQuizToolName(name: string): name is TutorToolName {
  return QUIZ_TOOL_NAMES.has(name as TutorToolName);
}

export function schedulePlanningTools(args: {
  toolCalls: ToolCall[];
  toolPolicy: TutorToolPolicy;
  phase: TutorPhase;
  hasPlan: boolean;
  hasActiveNode: boolean;
  usedTutorContentTool: boolean;
  searchEnabled?: boolean;
  searchProvider?: string;
  quizCallsThisTurn: number;
  maxToolsPerTurn: number;
  toolsUsedThisTurn: number;
}): ToolCall[] {
  const {
    toolCalls,
    toolPolicy,
    phase,
    hasPlan,
    hasActiveNode,
    usedTutorContentTool,
    searchEnabled,
    searchProvider,
    quizCallsThisTurn,
    maxToolsPerTurn,
    toolsUsedThisTurn,
  } = args;

  const scheduledRaw = schedulePlanningToolCalls(toolCalls, {
    hasPlan,
    hasActiveNode,
    alreadyUsedContent: usedTutorContentTool,
    allowSearch: searchEnabled && searchProvider === 'brave',
    phase,
  });

  let remainingQuizBudget =
    (toolPolicy.quizzesRemaining ?? Number.POSITIVE_INFINITY) - quizCallsThisTurn;
  let remainingTools = Math.max(0, maxToolsPerTurn - toolsUsedThisTurn);
  const scheduled: ToolCall[] = [];

  for (const call of scheduledRaw) {
    if (remainingTools <= 0) break;
    const name = call.function?.name ?? '';
    if (isQuizToolName(name)) {
      if (remainingQuizBudget <= 0) continue;
      remainingQuizBudget -= 1;
    }
    scheduled.push(call);
    remainingTools -= 1;
  }

  return scheduled;
}
