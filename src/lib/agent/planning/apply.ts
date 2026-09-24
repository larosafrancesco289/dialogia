import type { SearchMode } from '@/lib/search/providers/types';
import { parseToolArguments } from '@/lib/agent/parsers';
import { executePlanningToolCall } from '@/lib/agent/tools/exec';
import { createToolExecutionLogger } from '@/lib/agent/tools/executionLogger';
import type { ModelMessage, PlanTurnOptions, ToolCall, ToolModelMessage } from '@/lib/agent/types';
import type { PlanningToolExecutionResult, ToolResult } from '@/lib/tools/execution';
import type { Message } from '@/lib/types';
import type { PlanningExecutionState } from '@/lib/agent/planning/types';

/** What one executed call produced, as the agent loop needs it. */
export type ToolCallOutcome = {
  call: ToolCall;
  /** The tool message content the model reads for this call. */
  content: string;
  endsTurn: boolean;
  replay?: PlanningToolExecutionResult['replay'];
};

const describeError = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

export async function applyToolExecutions(args: {
  scheduled: ToolCall[];
  round: number;
  convo: ModelMessage[];
  context: {
    chat: PlanTurnOptions['chat'];
    chatId: string;
    assistantMessage: Message;
    userContent: string;
    searchProvider: SearchMode;
    controller: AbortController;
    set: PlanTurnOptions['turn']['set'];
    get: PlanTurnOptions['turn']['get'];
    persistMessage: PlanTurnOptions['turn']['persistMessage'];
  };
  state: PlanningExecutionState;
  /**
   * Agent-loop semantics: a handler that throws becomes an error result the
   * model can read and recover from, instead of failing the turn; and once the
   * turn is stopped, no further call runs.
   */
  agentLoop?: boolean;
  onOutcome?: (outcome: ToolCallOutcome) => void;
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
    if (args.agentLoop && context.controller.signal.aborted) break;
    const parsedArgs = parseToolArguments(tc);
    const roundMeta = Number.isFinite(round) ? { round } : undefined;
    let execution: PlanningToolExecutionResult;
    try {
      execution = await executePlanningToolCall({
        toolCall: tc,
        parsedArgs,
        roundMeta,
        context: { ...context, logger },
        aggregatedResults: next.aggregatedResults,
      });
    } catch (error) {
      if (!args.agentLoop || context.controller.signal.aborted) throw error;
      execution = {
        usedTool: false,
        usedContentTool: false,
        result: {
          ok: false,
          error: describeError(error),
          hint: 'The tool failed unexpectedly. Retry once, or carry on without it.',
        },
      };
    }
    const messages = execution.convoMessages ?? [];
    if (messages.length > 0) {
      convo.push(...messages);
    }
    // Every call needs an answer: a provider rejects a tool call with no result.
    let toolMessage = messages.find(
      (message): message is ToolModelMessage =>
        message.role === 'tool' && message.tool_call_id === tc.id,
    );
    if (!toolMessage) {
      const result: ToolResult =
        execution.result ??
        (execution.usedTool
          ? { ok: true }
          : { ok: false, error: `${tc.function.name} did not run.` });
      toolMessage = {
        role: 'tool',
        name: tc.function.name,
        tool_call_id: tc.id,
        content: JSON.stringify(result),
      };
      convo.push(toolMessage);
    }
    args.onOutcome?.({
      call: tc,
      content: toolMessage.content,
      endsTurn: execution.endsTurn === true,
      replay: execution.replay,
    });
    next.aggregatedResults = execution.aggregatedResults ?? next.aggregatedResults;
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
