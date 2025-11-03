import { v4 as uuidv4 } from 'uuid';
import type { ToolCallLogEntry } from '@/lib/types';
import type { StoreSetter } from '@/lib/agent/types';
import type { StoreState } from '@/lib/store/types';

type MessageUpdater = (message: import('@/lib/types').Message) => import('@/lib/types').Message;

function mutateMessage(
  state: StoreState,
  chatId: string,
  messageId: string,
  updater: MessageUpdater,
): Partial<StoreState> | undefined {
  const list = state.messages[chatId];
  if (!Array.isArray(list) || list.length === 0) return undefined;
  let changed = false;
  const nextList = list.map((msg) => {
    if (msg.id !== messageId) return msg;
    const nextMessage = updater(msg);
    if (nextMessage !== msg) changed = true;
    return nextMessage;
  });
  if (!changed) return undefined;
  return {
    messages: {
      ...state.messages,
      [chatId]: nextList,
    },
  };
}

export type StartToolCallArgs = {
  set: StoreSetter;
  chatId: string;
  messageId: string;
  name: string;
  input: Record<string, unknown>;
  category?: ToolCallLogEntry['category'];
  metadata?: ToolCallLogEntry['metadata'];
};

export function startToolCallLogEntry({
  set,
  chatId,
  messageId,
  name,
  input,
  category,
  metadata,
}: StartToolCallArgs): ToolCallLogEntry {
  const entry: ToolCallLogEntry = {
    id: uuidv4(),
    name,
    timestamp: Date.now(),
    status: 'pending',
    input,
    category,
    ...(metadata ? { metadata: { ...metadata } } : {}),
  };
  set((state) => {
    const patch = mutateMessage(state as StoreState, chatId, messageId, (msg) => {
      const existing = Array.isArray(msg.toolCalls) ? msg.toolCalls : [];
      return { ...msg, toolCalls: [...existing, entry] };
    });
    return patch ?? (state as StoreState);
  });
  return entry;
}

export type UpdateToolCallArgs = {
  set: StoreSetter;
  chatId: string;
  messageId: string;
  toolCallId: string;
  updates: Partial<
    Pick<ToolCallLogEntry, 'status' | 'output' | 'error' | 'duration' | 'metadata' | 'category'>
  >;
};

export function updateToolCallLogEntry({
  set,
  chatId,
  messageId,
  toolCallId,
  updates,
}: UpdateToolCallArgs): void {
  set((state) => {
    const patch = mutateMessage(state as StoreState, chatId, messageId, (msg) => {
      const existing = Array.isArray(msg.toolCalls) ? msg.toolCalls : [];
      let changed = false;
      const nextCalls = existing.map((call) => {
        if (call.id !== toolCallId) return call;
        changed = true;
        const nextMetadata =
          updates.metadata != null
            ? { ...(call.metadata || {}), ...updates.metadata }
            : call.metadata;
        const nextCall = { ...call, ...updates };
        if (updates.metadata != null) nextCall.metadata = nextMetadata;
        return nextCall;
      });
      if (!changed) return msg;
      return { ...msg, toolCalls: nextCalls };
    });
    return patch ?? (state as StoreState);
  });
}

export function clearToolCallLogs({
  set,
  chatId,
  messageId,
}: {
  set: StoreSetter;
  chatId: string;
  messageId: string;
}): void {
  set((state) => {
    const patch = mutateMessage(state as StoreState, chatId, messageId, (msg) => {
      if (!msg.toolCalls || msg.toolCalls.length === 0) return msg;
      return { ...msg, toolCalls: [] };
    });
    return patch ?? (state as StoreState);
  });
}
