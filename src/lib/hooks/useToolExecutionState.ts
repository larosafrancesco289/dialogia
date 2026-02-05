import { useMemo, useRef } from 'react';
import type { Message, ToolCallLogEntry } from '@/lib/types';

export type ToolExecutionState = {
  isExecutingTools: boolean;
  toolCalls: ToolCallLogEntry[];
};

/**
 * Derives tool execution state from a message's toolCalls array.
 * Returns all tool calls (for UI to filter) and whether execution is active.
 *
 * The indicator stays visible until streaming completes, not just for a fixed time
 * after tool completion. This prevents a gap between indicator disappearing and
 * final content appearing.
 */
export function useToolExecutionState(message: Message, isStreaming: boolean): ToolExecutionState {
  // Track content length when tools were last active to detect new content
  const contentAtToolsRef = useRef<number | null>(null);

  return useMemo(() => {
    const toolCalls = message.toolCalls ?? [];
    const hasPending = toolCalls.some((tc) => tc.status === 'pending');
    const hasAnyTools = toolCalls.length > 0;
    const contentLength = message.content?.length ?? 0;

    // Track content length when we first see tools
    if (hasPending && contentAtToolsRef.current === null) {
      contentAtToolsRef.current = contentLength;
    }

    // Reset when streaming stops
    if (!isStreaming) {
      contentAtToolsRef.current = null;
    }

    // Show indicator if:
    // 1. Tools are pending, OR
    // 2. We have tools, streaming is active, and no new content has appeared since tools started
    const contentGrew =
      contentAtToolsRef.current !== null && contentLength > contentAtToolsRef.current;
    const isExecutingTools = isStreaming && hasAnyTools && (hasPending || !contentGrew);

    return { isExecutingTools, toolCalls };
  }, [message.toolCalls, message.content, isStreaming]);
}
