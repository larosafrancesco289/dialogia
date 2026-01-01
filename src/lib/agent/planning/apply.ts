import { parseToolArguments } from '@/lib/agent/parsers';
import { executePlanningToolCall } from '@/lib/agent/tools/exec';
import { createToolExecutionLogger } from '@/lib/agent/tools/executionLogger';
import { isQuizToolName } from '@/lib/agent/tools/schedulingPolicy';
import type { ModelMessage, PlanTurnOptions, ToolCall } from '@/lib/agent/types';
import type { Message } from '@/lib/types';
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
    searchProvider: 'brave' | 'openrouter';
    controller: AbortController;
    set: PlanTurnOptions['turn']['set'];
    get: PlanTurnOptions['turn']['get'];
    persistMessage: PlanTurnOptions['turn']['persistMessage'];
  };
  state: PlanningExecutionState;
}): Promise<PlanningExecutionState> {
  const { scheduled, round, convo, context, state } = args;
  const next: PlanningExecutionState = { ...state };
  const logger = createToolExecutionLogger({
    set: context.set,
    chatId: context.chatId,
    messageId: context.assistantMessage.id,
  });
  for (const tc of scheduled) {
    const toolName = tc.function?.name ?? '';
    const parsedArgs = parseToolArguments(tc);
    const roundMeta = Number.isFinite(round) ? { round } : undefined;
    const execution = await executePlanningToolCall({
      toolCall: tc,
      parsedArgs,
      roundMeta,
      context: { ...context, logger },
      aggregatedResults: next.aggregatedResults,
    });
    if (execution.convoMessages.length > 0) {
      convo.push(...execution.convoMessages);
    }
    next.aggregatedResults = execution.aggregatedResults;
    if (execution.learnerModel) next.learnerModel = execution.learnerModel;
    if (execution.planUpdates) next.planUpdates = execution.planUpdates;
    if (execution.updatedPlan) {
      next.updatedPlan = execution.updatedPlan;
      next.currentPlan = execution.updatedPlan;
    }
    if (execution.learnerModelDebug) next.learnerModelDebug = execution.learnerModelDebug;
    if (execution.usedTutorContentTool) {
      next.usedTutorContentTool = true;
    }
    if (isQuizToolName(toolName)) {
      next.quizCallsThisTurn += 1;
    }
    next.toolsUsedThisTurn += 1;
  }
  return next;
}
