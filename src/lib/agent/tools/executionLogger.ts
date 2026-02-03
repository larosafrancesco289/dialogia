import type { StoreSetter } from '@/lib/agent/types';
import type { ToolCallLogEntry } from '@/lib/types';
import { startToolCallLogEntry, updateToolCallLogEntry } from '@/lib/turns/runtime';

export type ToolExecutionLog = {
  success: (output?: Record<string, unknown>, metadataPatch?: ToolCallLogEntry['metadata']) => void;
  error: (
    output?: Record<string, unknown>,
    errorMessage?: string,
    metadataPatch?: ToolCallLogEntry['metadata'],
  ) => void;
};

export type ToolExecutionLogger = {
  start: (args: {
    name: string;
    input: Record<string, unknown>;
    category?: ToolCallLogEntry['category'];
    metadata?: ToolCallLogEntry['metadata'];
  }) => ToolExecutionLog;
};

export function createToolExecutionLogger(opts: {
  set: StoreSetter;
  chatId: string;
  messageId: string;
}): ToolExecutionLogger {
  const { set, chatId, messageId } = opts;

  return {
    start({ name, input, category, metadata }) {
      const entry = startToolCallLogEntry({
        set,
        chatId,
        messageId,
        name,
        input,
        category,
        metadata,
      });
      const startedAt = performance.now();

      return {
        success(output, metadataPatch) {
          updateToolCallLogEntry({
            set,
            chatId,
            messageId,
            toolCallId: entry.id,
            updates: {
              status: 'success',
              output,
              duration: Math.max(0, Math.round(performance.now() - startedAt)),
              metadata: metadataPatch,
            },
          });
        },
        error(output, errorMessage, metadataPatch) {
          updateToolCallLogEntry({
            set,
            chatId,
            messageId,
            toolCallId: entry.id,
            updates: {
              status: 'error',
              output,
              error: errorMessage,
              duration: Math.max(0, Math.round(performance.now() - startedAt)),
              metadata: metadataPatch,
            },
          });
        },
      };
    },
  };
}
