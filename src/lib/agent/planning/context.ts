import type { PlanTurnOptions, ToolDefinition } from '@/lib/agent/types';
import { isTutorToolName } from '@/lib/agent/tools';
import { getTutorPhase, getTutorToolEligibility } from '@/lib/agent/tutor/state';
import { getNextNode } from '@/lib/learning-plan/service';
import type { Message } from '@/lib/types';
import type { UiSnapshot } from '@/lib/contracts/ui';
import type { PlanningContext } from '@/lib/agent/planning/types';

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
  const { allowedTutorTools, toolPolicy } = getTutorToolEligibility({
    chat,
    ui,
    phase,
    activeNodeId,
  });
  const planningToolDefinition =
    Array.isArray(toolDefinition) && toolDefinition.length > 0
      ? toolDefinition.filter((def) => {
          const name = def.function?.name;
          if (!name) return false;
          if (isTutorToolName(name)) return allowedTutorTools.has(name);
          return true;
        })
      : undefined;
  return { phase, planningToolDefinition, allowedTutorTools, toolPolicy };
}
