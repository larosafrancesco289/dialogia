// Module: agent/tools/tutor/moduleEntry
// Responsibility: The tutor module's surface to core — everything `src/lib/modules.ts`
// needs, and nothing core knows about tutor internals.

import type { ModulePlanningArgs, ModulePlanningContribution } from '@/lib/modules';
import type { ToolGate } from '@/lib/agent/planning/types';
import { getTutorPhase, getTutorToolEligibility } from '@/lib/agent/tutor/state';
import type { TutorPhase, TutorToolPolicy } from '@/lib/agent/tutor/state';
import { buildTutorContentPriority } from '@/lib/agent/tools/tutor/contentPriority';
import {
  getTutorToolsByTag,
  isTutorToolName,
  TUTOR_MODULE_ID,
} from '@/lib/agent/tools/tutor/register';
import { getNextNode } from '@/lib/learning-plan/service';

export { registerTutorTools } from '@/lib/agent/tools/tutor/register';

export type TutorModuleContext = {
  phase: TutorPhase;
  toolPolicy: TutorToolPolicy;
  hasPlan: boolean;
  hasActiveNode: boolean;
};

export function readTutorModuleContext(
  moduleContext?: Record<string, unknown>,
): TutorModuleContext | undefined {
  const slot = moduleContext?.[TUTOR_MODULE_ID];
  return slot ? (slot as TutorModuleContext) : undefined;
}

export function buildTutorPlanningContribution(
  args: ModulePlanningArgs,
): ModulePlanningContribution | undefined {
  const { chat, messagesForChat, ui, currentPlan } = args;
  if (!chat.settings.features.tutor?.enabled) return undefined;

  const phase = getTutorPhase(chat, messagesForChat, ui);
  const activeNodeId = currentPlan ? getNextNode(currentPlan)?.id : undefined;
  const { allowedTutorTools, toolPolicy } = getTutorToolEligibility({
    chat,
    ui,
    phase,
    activeNodeId,
  });

  const quizTools = new Set<string>(getTutorToolsByTag('quiz'));
  let quizBudget = toolPolicy.quizzesRemaining ?? Number.POSITIVE_INFINITY;

  const gate: ToolGate = {
    // Only tutor-owned names are gated here; other modules' tools are their business.
    isAllowed: (name) => {
      if (!isTutorToolName(name)) return true;
      if (!allowedTutorTools.has(name)) return false;
      return !quizTools.has(name) || quizBudget > 0;
    },
    onBudgetExceeded: () => 'skip',
    contentPriority: buildTutorContentPriority({
      phase,
      hasPlan: Boolean(currentPlan),
      hasActiveNode: Boolean(currentPlan?.nodes.some((node) => node.status === 'in_progress')),
    }),
    maxToolsPerTurn: toolPolicy.maxToolsPerTurn,
    onScheduled: (name) => {
      if (quizTools.has(name)) quizBudget -= 1;
    },
  };

  const moduleContext: TutorModuleContext = {
    phase,
    toolPolicy,
    hasPlan: Boolean(currentPlan),
    hasActiveNode: Boolean(currentPlan?.nodes.some((node) => node.status === 'in_progress')),
  };

  return { gate, moduleContext: { [TUTOR_MODULE_ID]: moduleContext } };
}
