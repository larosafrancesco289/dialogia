import { parseToolArguments } from '@/lib/agent/parsers';
import { executePlanningToolCall } from '@/lib/agent/tools/exec';
import { createToolExecutionLogger } from '@/lib/agent/tools/executionLogger';
import type { ModelMessage, PlanTurnOptions, ToolCall } from '@/lib/agent/types';
import type { LearningPlan, Message } from '@/lib/types';
import {
  readContentModuleResult,
  withContentModuleResult,
} from '@/lib/agent/planning/moduleResult';
import type { PlanningExecutionState } from '@/lib/agent/planning/types';

export async function applyToolExecutions(args: {
  scheduled: ToolCall[];
  round: number;
  convo: ModelMessage[];
  context: {
    chat: PlanTurnOptions['chat'];
    chatId: string;
    assistantMessage: Message;
    userContent: string;
    searchProvider: 'tavily' | 'openrouter';
    controller: AbortController;
    set: PlanTurnOptions['turn']['set'];
    get: PlanTurnOptions['turn']['get'];
    persistMessage: PlanTurnOptions['turn']['persistMessage'];
  };
  state: PlanningExecutionState;
}): Promise<PlanningExecutionState> {
  const { scheduled, round, convo, context, state } = args;
  let next: PlanningExecutionState = { ...state };
  const logger = createToolExecutionLogger({
    set: context.set,
    get: context.get,
    chatId: context.chatId,
    messageId: context.assistantMessage.id,
  });
  for (const tc of scheduled) {
    const parsedArgs = parseToolArguments(tc);
    const roundMeta = Number.isFinite(round) ? { round } : undefined;
    // Create getCurrentPlan that returns the most up-to-date plan from the execution state.
    // This ensures subsequent tool calls in the same turn see plan updates from earlier calls.
    const getCurrentPlan = (): LearningPlan | undefined =>
      readContentModuleResult(next).currentPlan ??
      context.chat.settings.features.tutor?.learningPlan;
    const execution = await executePlanningToolCall({
      toolCall: tc,
      parsedArgs,
      roundMeta,
      context: { ...context, logger, getCurrentPlan },
      aggregatedResults: next.aggregatedResults,
    });
    if (execution.convoMessages.length > 0) {
      convo.push(...execution.convoMessages);
    }
    next.aggregatedResults = execution.aggregatedResults;
    next = withContentModuleResult(next, {
      ...(execution.learnerModel ? { learnerModel: execution.learnerModel } : {}),
      ...(execution.planUpdates ? { planUpdates: execution.planUpdates } : {}),
      ...(execution.updatedPlan
        ? { updatedPlan: execution.updatedPlan, currentPlan: execution.updatedPlan }
        : {}),
      ...(execution.learnerModelDebug ? { learnerModelDebug: execution.learnerModelDebug } : {}),
    });
    if (execution.usedContentTool) {
      next.usedContentTool = true;
    }
    if (execution.usedTool) {
      next.successfulToolCallsThisTurn += 1;
    } else {
      next.failedToolCallsThisTurn += 1;
    }
    next.toolsUsedThisTurn += 1;
  }
  return next;
}
