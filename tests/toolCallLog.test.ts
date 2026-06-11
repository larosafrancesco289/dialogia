import { test } from 'node:test';
import assert from 'node:assert/strict';
import { removeOrphanPendingToolCalls } from '@/lib/turns/runtime/toolCallLog';
import type { Message, ToolCallLogEntry } from '@/lib/types';

const buildEntry = (
  id: string,
  status: ToolCallLogEntry['status'],
  input: Record<string, unknown>,
): ToolCallLogEntry => ({
  id,
  name: 'web_search',
  timestamp: 1,
  status,
  input,
});

const buildState = (toolCalls: ToolCallLogEntry[]) => {
  const message = {
    id: 'm1',
    chatId: 'c1',
    role: 'assistant',
    content: '',
    createdAt: 1,
    toolCalls,
    activity: toolCalls.map((entry) => ({
      id: entry.id,
      type: 'tool_call' as const,
      name: entry.name,
      timestamp: entry.timestamp,
      status: entry.status,
      input: entry.input,
    })),
  } as unknown as Message;
  return {
    messagesById: { m1: message },
    messageIdsByChatId: { c1: ['m1'] },
  };
};

test('removeOrphanPendingToolCalls drops pre-logged entries that never executed', () => {
  let state = buildState([
    buildEntry('orphan', 'pending', {}),
    buildEntry('running', 'pending', { query: 'a' }),
    buildEntry('done', 'success', { query: 'b' }),
  ]);
  const set = (updater: (s: typeof state) => Partial<typeof state>) => {
    state = { ...state, ...updater(state) };
  };

  removeOrphanPendingToolCalls({
    set: set as never,
    chatId: 'c1',
    messageId: 'm1',
  });

  const message = state.messagesById.m1;
  assert.deepEqual(
    (message.toolCalls ?? []).map((entry) => entry.id),
    ['running', 'done'],
  );
  assert.deepEqual(
    (message.activity ?? []).map((item) => item.id),
    ['running', 'done'],
  );
});

test('removeOrphanPendingToolCalls leaves messages without orphans untouched', () => {
  let calls = 0;
  let state = buildState([buildEntry('done', 'success', { query: 'b' })]);
  const set = (updater: (s: typeof state) => Partial<typeof state>) => {
    calls += 1;
    state = { ...state, ...updater(state) };
  };

  removeOrphanPendingToolCalls({
    set: set as never,
    chatId: 'c1',
    messageId: 'm1',
  });

  assert.equal(calls, 1);
  assert.equal((state.messagesById.m1.toolCalls ?? []).length, 1);
});
