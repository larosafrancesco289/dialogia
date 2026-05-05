import type { ToolCall, TutorToolName } from '@/lib/agent/types';
import { isTutorToolName } from '@/lib/agent/tools';
import { schedulePlanningTools } from '@/lib/agent/tools/schedulingPolicy';
import type { TutorPhase, TutorToolPolicy } from '@/lib/agent/tutor/state';
import type { LearningPlan } from '@/lib/types';

export function schedulePlanningRound(args: {
  toolCalls: ToolCall[];
  allowedTutorTools: Set<TutorToolName>;
  toolPolicy: TutorToolPolicy;
  phase: TutorPhase;
  currentPlan?: LearningPlan;
  searchEnabled: boolean;
  searchProvider: 'tavily' | 'openrouter';
  usedTutorContentTool: boolean;
  quizCallsThisTurn: number;
  maxToolsPerTurn: number;
  toolsUsedThisTurn: number;
}): ToolCall[] {
  const {
    toolCalls,
    allowedTutorTools,
    toolPolicy,
    phase,
    currentPlan,
    searchEnabled,
    searchProvider,
    usedTutorContentTool,
    quizCallsThisTurn,
    maxToolsPerTurn,
    toolsUsedThisTurn,
  } = args;

  const filteredToolCalls =
    toolCalls.length === 0
      ? []
      : toolCalls.filter((call) => {
          const name = call.function?.name ?? '';
          if (!name) return false;
          if (isTutorToolName(name)) return allowedTutorTools.has(name);
          return true;
        });

  return schedulePlanningTools({
    toolCalls: filteredToolCalls,
    toolPolicy,
    phase,
    hasPlan: Boolean(currentPlan),
    hasActiveNode: Boolean(currentPlan?.nodes.some((node) => node.status === 'in_progress')),
    usedTutorContentTool,
    searchEnabled,
    searchProvider,
    quizCallsThisTurn,
    maxToolsPerTurn,
    toolsUsedThisTurn,
  });
}
