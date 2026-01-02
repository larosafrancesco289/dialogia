import type { PlanTurnOptions, ToolDefinition, TutorToolName } from '@/lib/agent/types';
import { isTutorToolName } from '@/lib/agent/tools';
import {
  allowedTutorToolsForPhase,
  deriveTutorToolPolicy,
  getTutorPhase,
  type TutorPhase,
  type TutorToolPolicy,
} from '@/lib/agent/tutor/state';
import { getNextNode } from '@/lib/learningPlan/service';
import type { Message } from '@/lib/types';
import type { UiSnapshot } from '@/lib/contracts/ui';
import type { PlanningContext } from '@/lib/agent/planning/types';

function filterAllowedToolsForPhase(args: {
  toolDefinition?: ToolDefinition[];
  chat: PlanTurnOptions['chat'];
  ui?: UiSnapshot;
  phase: TutorPhase;
  activeNodeId?: string;
}): {
  planningToolDefinition?: ToolDefinition[];
  allowedTutorTools: Set<TutorToolName>;
  toolPolicy: TutorToolPolicy;
} {
  const { toolDefinition, chat, ui, phase, activeNodeId } = args;
  const toolPolicy = deriveTutorToolPolicy({
    chat,
    ui,
    activeNodeId,
  });
  const allowedTutorTools = new Set(allowedTutorToolsForPhase(phase, toolPolicy));
  const planningToolDefinition =
    Array.isArray(toolDefinition) && toolDefinition.length > 0
      ? toolDefinition.filter((def) => {
          const name = def.function?.name;
          if (!name) return false;
          if (isTutorToolName(name)) return allowedTutorTools.has(name);
          return true;
        })
      : undefined;

  return { planningToolDefinition, allowedTutorTools, toolPolicy };
}

export function derivePlanningContext(args: {
  chat: PlanTurnOptions['chat'];
  messagesForChat: Message[];
  ui?: UiSnapshot;
  toolDefinition?: ToolDefinition[];
  currentPlan?: PlanTurnOptions['chat']['settings']['features']['tutor']['learningPlan'];
}): PlanningContext {
  const { chat, messagesForChat, ui, toolDefinition, currentPlan } = args;
  const phase = getTutorPhase(chat, messagesForChat, ui);
  const activeNodeId = currentPlan ? getNextNode(currentPlan)?.id : undefined;
  const { planningToolDefinition, allowedTutorTools, toolPolicy } = filterAllowedToolsForPhase({
    toolDefinition,
    chat,
    ui,
    phase,
    activeNodeId,
  });
  return { phase, planningToolDefinition, allowedTutorTools, toolPolicy };
}
