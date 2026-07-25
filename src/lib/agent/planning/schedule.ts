import { isNativeSearchMode, type SearchMode } from '@/lib/search/providers/types';
// Module: agent/planning/schedule
// Responsibility: Apply the turn's ToolGate to a round of tool calls, then order
// them with the core scheduler and cap them against the per-turn budget.

import type { ToolCall } from '@/lib/agent/types';
import { schedulePlanningToolCalls } from '@/lib/agent/tools/scheduler';
import type { ToolGate } from '@/lib/agent/planning/types';

export function schedulePlanningRound(args: {
  toolCalls: ToolCall[];
  gate: ToolGate;
  searchEnabled: boolean;
  searchProvider: SearchMode;
  usedContentTool: boolean;
  toolsUsedThisTurn: number;
}): ToolCall[] {
  const { toolCalls, gate, searchEnabled, searchProvider, usedContentTool, toolsUsedThisTurn } =
    args;

  const allowed: ToolCall[] = [];
  for (const call of toolCalls) {
    const name = call.function?.name ?? '';
    if (!name) continue;
    if (gate.isAllowed(name)) {
      allowed.push(call);
      continue;
    }
    if (gate.onBudgetExceeded?.(name) === 'stop') break;
  }

  const ordered = schedulePlanningToolCalls(allowed, {
    alreadyUsedContent: usedContentTool,
    allowSearch: searchEnabled && !isNativeSearchMode(searchProvider),
    contentPriority: gate.contentPriority,
  });

  const cap = gate.maxToolsPerTurn ?? Number.POSITIVE_INFINITY;
  const remaining = Math.max(0, cap - toolsUsedThisTurn);
  const scheduled = ordered.slice(0, remaining);
  for (const call of scheduled) {
    const name = call.function?.name;
    if (name) gate.onScheduled?.(name);
  }
  return scheduled;
}
