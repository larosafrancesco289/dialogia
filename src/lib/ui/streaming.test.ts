import { test } from 'node:test';
import assert from 'node:assert/strict';
import { penIsLive, thinkingNow } from '@/lib/ui/streaming';
import type { Message, MessageActivityItem, ToolCallLogEntry } from '@/lib/types';

const thought = (timestamp: number, status: 'streaming' | 'done'): MessageActivityItem => ({
  id: `t${timestamp}`,
  type: 'reasoning',
  text: 'Weighing it.',
  timestamp,
  status,
});
const tool = (timestamp: number, status: ToolCallLogEntry['status']): ToolCallLogEntry => ({
  id: `c${timestamp}`,
  name: 'memory_save',
  input: {},
  timestamp,
  status,
});
const reply = (patch: Partial<Message>) =>
  ({ content: 'The answer is 42.', activity: [], toolCalls: [], ...patch }) as Pick<
    Message,
    'content' | 'activity' | 'toolCalls'
  >;

test('the model is thinking while its latest step is a thought still being written', () => {
  assert.equal(thinkingNow(reply({ activity: [thought(1, 'streaming')] })), true);
  assert.equal(thinkingNow(reply({ activity: [thought(1, 'done')] })), false);
  // A call made after the thought began is the later step.
  assert.equal(
    thinkingNow(reply({ activity: [thought(1, 'streaming')], toolCalls: [tool(2, 'pending')] })),
    false,
  );
  // The next round's thought comes after the last round's call.
  assert.equal(
    thinkingNow(reply({ activity: [thought(3, 'streaming')], toolCalls: [tool(2, 'success')] })),
    true,
  );
});

test('after the words, the pen is live while a call runs or no word arrives, never while thinking', () => {
  // The round after a kept answer and its save: silent, nothing pending.
  const afterSave = reply({ toolCalls: [tool(2, 'success')] });
  assert.equal(penIsLive(afterSave, true), true);
  // Words arriving: no mark.
  assert.equal(penIsLive(afterSave, false), false);
  // A call still being written or run.
  assert.equal(penIsLive(reply({ toolCalls: [tool(2, 'pending')] }), false), true);
  // Thinking again: the reasoning line's mark answers, not the pen.
  const thinking = reply({ activity: [thought(3, 'streaming')], toolCalls: [tool(2, 'success')] });
  assert.equal(penIsLive(thinking, true), false);
  // Before the first word the other marks answer.
  assert.equal(penIsLive(reply({ content: '' }), true), false);
  assert.equal(penIsLive(reply({ content: '', toolCalls: [tool(2, 'pending')] }), true), false);
});
