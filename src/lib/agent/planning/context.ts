// Module: agent/planning/context
// Responsibility: Build the per-turn PlanningContext. Gating and per-turn module
// state come from the enabled modules; core only knows the ToolGate interface.

import type { PlanTurnOptions, ToolDefinition } from '@/lib/agent/types';
import { loadedModuleRuntimes } from '@/lib/modules';
import type { LearningPlan, Message } from '@/lib/types';
import type { UiSnapshot } from '@/lib/contracts/ui';
import type { PlanningContext, ToolGate } from '@/lib/agent/planning/types';

const composeGates = (gates: ToolGate[]): ToolGate => {
  if (gates.length === 1) return gates[0];
  return {
    isAllowed: (name) => gates.every((gate) => gate.isAllowed(name)),
    onBudgetExceeded: (name) =>
      gates.some((gate) => gate.onBudgetExceeded?.(name) === 'stop') ? 'stop' : 'skip',
    contentPriority: gates.find((gate) => gate.contentPriority)?.contentPriority,
    maxToolsPerTurn: gates.reduce<number | undefined>((min, gate) => {
      if (gate.maxToolsPerTurn == null) return min;
      return min == null ? gate.maxToolsPerTurn : Math.min(min, gate.maxToolsPerTurn);
    }, undefined),
    onScheduled: (name) => gates.forEach((gate) => gate.onScheduled?.(name)),
  };
};

const ALLOW_ALL: ToolGate = { isAllowed: () => true };

export function derivePlanningContext(args: {
  chat: PlanTurnOptions['chat'];
  messagesForChat: Message[];
  ui?: UiSnapshot;
  toolDefinition?: ToolDefinition[];
  currentPlan?: LearningPlan;
}): PlanningContext {
  const { chat, messagesForChat, ui, toolDefinition, currentPlan } = args;

  const gates: ToolGate[] = [];
  let moduleContext: Record<string, unknown> | undefined;
  for (const runtime of loadedModuleRuntimes()) {
    const contribution = runtime.planning?.({ chat, messagesForChat, ui, currentPlan });
    if (!contribution) continue;
    gates.push(contribution.gate);
    if (contribution.moduleContext) {
      moduleContext = { ...(moduleContext ?? {}), ...contribution.moduleContext };
    }
  }
  const gate = gates.length ? composeGates(gates) : ALLOW_ALL;

  const offered = Array.isArray(toolDefinition) ? toolDefinition : [];
  return {
    toolDefinitions: offered.filter((def) => {
      const name = def.function?.name;
      return !!name && gate.isAllowed(name);
    }),
    gate,
    moduleContext,
  };
}
