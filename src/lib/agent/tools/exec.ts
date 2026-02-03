import { getToolHandler } from '@/lib/tools/registry';
import type { PlanningToolExecutionResult, ToolExecutionArgs } from '@/lib/tools/execution';

export async function executePlanningToolCall(
  opts: ToolExecutionArgs,
): Promise<PlanningToolExecutionResult> {
  const { toolCall, parsedArgs, roundMeta, context, aggregatedResults } = opts;
  const callName = toolCall.function.name;
  const handler = getToolHandler(callName);
  try {
    if (handler) {
      return await handler(opts);
    }
    const log = context.logger.start({
      name: callName,
      input: parsedArgs,
      category: 'other',
      metadata: roundMeta,
    });
    log.error(undefined, `Unsupported tool: ${callName}`, roundMeta ? { ...roundMeta } : undefined);
    return {
      convoMessages: [
        {
          role: 'tool',
          name: callName,
          tool_call_id: toolCall.id,
          content: JSON.stringify({ ok: false, error: `Unsupported tool: ${callName}` }),
        },
      ],
      aggregatedResults,
      usedTool: false,
      usedTutorContentTool: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const log = context.logger.start({
      name: callName,
      input: parsedArgs,
      category: 'other',
      metadata: roundMeta,
    });
    log.error(undefined, message, roundMeta ? { ...roundMeta } : undefined);
    throw error;
  }
}
