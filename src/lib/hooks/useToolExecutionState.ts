import { useMemo } from 'react';
import type { Message, ToolCallLogEntry } from '@/lib/types';

export type ToolExecutionState = {
  isExecutingTools: boolean;
  pendingTools: ToolCallLogEntry[];
};

/**
 * Derives tool execution state from a message's toolCalls array.
 */
export function useToolExecutionState(message: Message, isStreaming: boolean): ToolExecutionState {
  return useMemo(() => {
    const toolCalls = message.toolCalls ?? [];
    const pendingTools = toolCalls.filter((tc) => tc.status === 'pending');
    const isExecutingTools = isStreaming && pendingTools.length > 0;

    return { isExecutingTools, pendingTools };
  }, [message.toolCalls, isStreaming]);
}
