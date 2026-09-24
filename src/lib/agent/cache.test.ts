import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyCacheBreakpoints, buildSystemMessage } from './cache';
import type { ModelMessage } from '@/lib/transport/contracts';

const EPHEMERAL = { type: 'ephemeral' };

/** Where the markers landed, as [message index, block index] pairs. */
const markers = (messages: ModelMessage[]) =>
  messages.flatMap((message, i) =>
    Array.isArray(message.content)
      ? message.content.flatMap((block, j) =>
          'cache_control' in block && block.cache_control ? [[i, j]] : [],
        )
      : [],
  );

test('buildSystemMessage caches the stable part and leaves the dynamic part uncached', () => {
  assert.deepEqual(buildSystemMessage({ systemStable: 'Rules.', systemDynamic: 'State: 1' }), {
    role: 'system',
    content: [
      { type: 'text', text: 'Rules.', cache_control: EPHEMERAL },
      { type: 'text', text: 'State: 1' },
    ],
  });
  assert.deepEqual(buildSystemMessage({ systemStable: 'Rules.' }), {
    role: 'system',
    content: [{ type: 'text', text: 'Rules.', cache_control: EPHEMERAL }],
  });
});

test('buildSystemMessage takes the dynamic part from the combined prompt when it extends the stable one', () => {
  // Search sources are appended after compose, so the combined prompt is the fresher one.
  const message = buildSystemMessage({
    combinedSystem: 'Rules.\n\nState: 1\n\nSources: a',
    systemStable: 'Rules.',
    systemDynamic: 'State: 1',
  });
  assert.deepEqual(message?.content, [
    { type: 'text', text: 'Rules.', cache_control: EPHEMERAL },
    { type: 'text', text: 'State: 1\n\nSources: a' },
  ]);

  // A combined prompt that does not start with the stable part is ignored.
  const unrelated = buildSystemMessage({
    combinedSystem: 'Something else',
    systemStable: 'Rules.',
    systemDynamic: 'State: 1',
  });
  assert.deepEqual(unrelated?.content, [
    { type: 'text', text: 'Rules.', cache_control: EPHEMERAL },
    { type: 'text', text: 'State: 1' },
  ]);
});

test('buildSystemMessage without a split passes the combined prompt through, or gives nothing', () => {
  assert.deepEqual(buildSystemMessage({ combinedSystem: 'Be brief.' }), {
    role: 'system',
    content: 'Be brief.',
  });
  assert.equal(buildSystemMessage({}), undefined);
});

test('applyCacheBreakpoints marks the system prompt and the history before the last user turn', () => {
  const messages: ModelMessage[] = [
    { role: 'system', content: 'Be brief.' },
    { role: 'user', content: 'One' },
    { role: 'assistant', content: 'Two' },
    { role: 'user', content: 'Three' },
  ];
  const result = applyCacheBreakpoints(messages);

  assert.deepEqual(result[0], {
    role: 'system',
    content: [{ type: 'text', text: 'Be brief.', cache_control: EPHEMERAL }],
  });
  assert.deepEqual(result[2].content, [{ type: 'text', text: 'Two', cache_control: EPHEMERAL }]);
  // The final user message is new each turn, so it is never marked.
  assert.equal(result[3].content, 'Three');
  assert.deepEqual(markers(result), [
    [0, 0],
    [2, 0],
  ]);
});

test('applyCacheBreakpoints leaves a system prompt already split by buildSystemMessage alone', () => {
  const system = buildSystemMessage({ systemStable: 'Rules.', systemDynamic: 'State: 1' })!;
  const result = applyCacheBreakpoints([system, { role: 'user', content: 'Hi' }]);
  // Marking the last block would cache the dynamic part and bust the cache every turn.
  assert.deepEqual(result[0], system);
  assert.deepEqual(markers(result), [[0, 0]]);
});

test('applyCacheBreakpoints skips history with no text, which the API rejects a marker on', () => {
  const messages: ModelMessage[] = [
    { role: 'user', content: 'Look this up' },
    {
      role: 'assistant',
      content: null,
      tool_calls: [
        { id: 'c1', type: 'function', function: { name: 'web_search', arguments: '{}' } },
      ],
    },
    { role: 'tool', content: 'results', tool_call_id: 'c1' },
    { role: 'assistant', content: '   ' },
    { role: 'user', content: [{ type: 'image_url', image_url: { url: 'data:x' } }] },
    { role: 'user', content: 'And now?' },
  ];
  const result = applyCacheBreakpoints(messages);

  // The marker moves past the empty assistant rounds, the tool result and the
  // image-only turn to the nearest user or assistant message with text.
  assert.deepEqual(markers(result), [[0, 0]]);
  assert.equal(result[1].content, null);
  assert.equal(result[3].content, '   ');
});

test('applyCacheBreakpoints marks the last text block of multipart history', () => {
  const result = applyCacheBreakpoints([
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What is this?' },
        { type: 'image_url', image_url: { url: 'data:x' } },
      ],
    },
    { role: 'user', content: 'Well?' },
  ]);
  assert.deepEqual(result[0].content, [
    { type: 'text', text: 'What is this?', cache_control: EPHEMERAL },
    { type: 'image_url', image_url: { url: 'data:x' } },
  ]);
});

test('applyCacheBreakpoints marks no history when nothing precedes the only user message', () => {
  const alone = applyCacheBreakpoints([{ role: 'user', content: 'Hi' }]);
  assert.deepEqual(alone, [{ role: 'user', content: 'Hi' }]);

  const afterSystem = applyCacheBreakpoints([
    { role: 'system', content: 'Be brief.' },
    { role: 'user', content: 'Hi' },
  ]);
  assert.deepEqual(markers(afterSystem), [[0, 0]]);
  assert.equal(afterSystem[1].content, 'Hi');

  // No user message at all: only the system prompt is marked.
  const noUser = applyCacheBreakpoints([
    { role: 'system', content: 'Be brief.' },
    { role: 'assistant', content: 'Hello' },
  ]);
  assert.deepEqual(markers(noUser), [[0, 0]]);
});

test('applyCacheBreakpoints never marks an empty system prompt', () => {
  for (const content of ['', '  ', null]) {
    const result = applyCacheBreakpoints([
      { role: 'system', content } as ModelMessage,
      { role: 'user', content: 'Hi' },
    ]);
    assert.deepEqual(markers(result), []);
    assert.equal(result[0].content, content);
  }
});

test('applyCacheBreakpoints marks the last text block with text, not a trailing empty one', () => {
  const result = applyCacheBreakpoints([
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Hello' },
        { type: 'text', text: '' },
      ],
    },
    { role: 'user', content: 'Well?' },
  ]);
  assert.deepEqual(result[0].content, [
    { type: 'text', text: 'Hello', cache_control: EPHEMERAL },
    { type: 'text', text: '' },
  ]);
});

test('applyCacheBreakpoints never mutates its input', () => {
  const messages: ModelMessage[] = [
    { role: 'system', content: 'Be brief.' },
    { role: 'user', content: [{ type: 'text', text: 'One' }] },
    { role: 'assistant', content: 'Two' },
    { role: 'user', content: 'Three' },
  ];
  const before = structuredClone(messages);
  const result = applyCacheBreakpoints(messages);

  assert.deepEqual(messages, before);
  assert.notEqual(result, messages);
  assert.equal(markers(messages).length, 0);
});
