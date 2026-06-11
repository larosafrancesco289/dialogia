import { v4 as uuidv4 } from 'uuid';
import type { ToolCallLogEntry } from '@/lib/types';
import type { StoreSetter } from '@/lib/agent/types';
import type { MessageIndexState } from '@/lib/messages/indexing';
import type { Message } from '@/lib/types';
import { updateMessageById } from '@/lib/messages/updateMessageById';

type MessageUpdater = (message: Message) => Message;

function mutateMessage<S extends MessageIndexState>(
  state: S,
  chatId: string,
  messageId: string,
  updater: MessageUpdater,
): Partial<S> | undefined {
  return updateMessageById(state, chatId, messageId, updater);
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
    const patch = mutateMessage(state, chatId, messageId, (msg) => {
      const existing = Array.isArray(msg.toolCalls) ? msg.toolCalls : [];
      const activity = Array.isArray(msg.activity) ? msg.activity : [];
      const toolActivity = {
        id: entry.id,
        type: 'tool_call' as const,
        name,
        timestamp: entry.timestamp,
        status: entry.status,
        input,
        category,
        metadata: entry.metadata,
        round: typeof metadata?.round === 'number' ? metadata.round : undefined,
      };
      return { ...msg, toolCalls: [...existing, entry], activity: [...activity, toolActivity] };
    });
    return patch ?? state;
  });
  return entry;
}

export type UpdateToolCallArgs = {
  set: StoreSetter;
  chatId: string;
  messageId: string;
  toolCallId: string;
  updates: Partial<
    Pick<
      ToolCallLogEntry,
      'status' | 'input' | 'output' | 'error' | 'duration' | 'metadata' | 'category'
    >
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
    const patch = mutateMessage(state, chatId, messageId, (msg) => {
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
      const activity = Array.isArray(msg.activity) ? msg.activity : [];
      const nextActivity = activity.map((item) => {
        if (item.type !== 'tool_call' || item.id !== toolCallId) return item;
        const nextMetadata =
          updates.metadata != null
            ? { ...(item.metadata || {}), ...updates.metadata }
            : item.metadata;
        return {
          ...item,
          ...(updates.status !== undefined ? { status: updates.status } : {}),
          ...(updates.input !== undefined ? { input: updates.input } : {}),
          ...(updates.output !== undefined ? { output: updates.output } : {}),
          ...(updates.error !== undefined ? { error: updates.error } : {}),
          ...(updates.duration !== undefined ? { duration: updates.duration } : {}),
          ...(updates.category !== undefined ? { category: updates.category } : {}),
          ...(updates.metadata !== undefined ? { metadata: nextMetadata } : {}),
        };
      });
      return { ...msg, toolCalls: nextCalls, activity: nextActivity };
    });
    return patch ?? state;
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
    const patch = mutateMessage(state, chatId, messageId, (msg) => {
      if (!msg.toolCalls || msg.toolCalls.length === 0) return msg;
      return { ...msg, toolCalls: [] };
    });
    return patch ?? state;
  });
}

// Pre-logged entries (created from streamed tool-call deltas with empty input)
// whose calls were dropped by scheduling would otherwise stay "pending" in the
// UI forever. Executed entries are resolved before this runs, so any pending
// entry with an empty input is an orphan.
export function removeOrphanPendingToolCalls({
  set,
  chatId,
  messageId,
}: {
  set: StoreSetter;
  chatId: string;
  messageId: string;
}): void {
  const isOrphan = (entry: { status?: string; input?: Record<string, unknown> }) =>
    entry.status === 'pending' && (!entry.input || Object.keys(entry.input).length === 0);
  set((state) => {
    const patch = mutateMessage(state, chatId, messageId, (msg) => {
      const toolCalls = Array.isArray(msg.toolCalls) ? msg.toolCalls : [];
      const activity = Array.isArray(msg.activity) ? msg.activity : [];
      const orphanIds = new Set(toolCalls.filter(isOrphan).map((entry) => entry.id));
      for (const item of activity) {
        if (item.type === 'tool_call' && isOrphan(item)) orphanIds.add(item.id);
      }
      if (orphanIds.size === 0) return msg;
      return {
        ...msg,
        toolCalls: toolCalls.filter((entry) => !orphanIds.has(entry.id)),
        activity: activity.filter((item) => item.type !== 'tool_call' || !orphanIds.has(item.id)),
      };
    });
    return patch ?? state;
  });
}

export type FindPendingToolCallArgs = {
  get: () => MessageIndexState;
  chatId: string;
  messageId: string;
  name: string;
};

export function findPendingToolCallEntry({
  get,
  chatId,
  messageId,
  name,
}: FindPendingToolCallArgs): ToolCallLogEntry | undefined {
  const state = get();
  const msg = state.messagesById?.[messageId];
  if (!msg || msg.chatId !== chatId) return undefined;
  const toolCalls = msg.toolCalls ?? [];
  return toolCalls.find((tc) => tc.name === name && tc.status === 'pending');
}
