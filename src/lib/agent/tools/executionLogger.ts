import type { StoreGetter, StoreSetter } from '@/lib/agent/types';
import type { ToolCallLogEntry } from '@/lib/types';
import {
  findPendingToolCallEntry,
  startToolCallLogEntry,
  updateToolCallLogEntry,
} from '@/lib/turns/runtime';

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
  get?: StoreGetter;
  chatId: string;
  messageId: string;
}): ToolExecutionLogger {
  const { set, get, chatId, messageId } = opts;

  return {
    start({ name, input, category, metadata }) {
      // Check if there's already a pre-logged pending entry for this tool
      const existing = get ? findPendingToolCallEntry({ get, chatId, messageId, name }) : undefined;

      if (existing) {
        // Pre-logged entries carry an empty input; fill in the real call so
        // the UI can show what is being searched/fetched while it runs.
        updateToolCallLogEntry({
          set,
          chatId,
          messageId,
          toolCallId: existing.id,
          updates: { input, category, metadata },
        });
      }
      const entry =
        existing ??
        startToolCallLogEntry({
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
