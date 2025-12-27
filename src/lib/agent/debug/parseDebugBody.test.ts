import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDebugBody } from '@/lib/agent/debug/parseDebugBody';

test('parseDebugBody returns null for empty payloads', () => {
  assert.equal(parseDebugBody(undefined), null);
  assert.equal(parseDebugBody('   '), null);
});

test('parseDebugBody extracts summary, tools, plugins, and messages', () => {
  const body = JSON.stringify({
    model: 'test-model',
    temperature: 0.7,
    top_p: 0.9,
    max_tokens: 120,
    reasoning: { effort: 'medium', max_tokens: 42 },
    tools: [{ function: { name: 'web_search' } }, { name: 'flashcards' }],
    stream: true,
    parallel_tool_calls: false,
    stream_options: { include_usage: true },
    modalities: ['text', 'image'],
    provider: { sort: 'speed' },
    plugins: [{ id: 'web' }, { id: 'file-parser' }],
    messages: [
      { role: 'user', content: 'Hi' },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hello there' }],
        tool_calls: [{ function: { name: 'web_search' } }],
      },
    ],
  });

  const snapshot = parseDebugBody(body, { includeRawJson: true });
  assert.ok(snapshot);
  assert.equal(
    snapshot.summaryItems.some((item) => item.label === 'Model'),
    true,
  );
  assert.deepEqual(snapshot.toolNames.sort(), ['flashcards', 'web_search']);
  assert.deepEqual(snapshot.pluginNames.sort(), ['file-parser', 'web']);
  assert.equal(snapshot.messageItems.length, 2);
  assert.equal(snapshot.messageItems[0]?.snippet, 'Hi');
  assert.equal(snapshot.messageItems[1]?.snippet, 'Hello there');
  assert.deepEqual(snapshot.messageItems[1]?.toolCalls, ['web_search']);
  assert.ok(snapshot.rawJson.includes('"model": "test-model"'));
});

test('parseDebugBody falls back to raw body when JSON parsing fails', () => {
  const body = '{ not valid json';
  const snapshot = parseDebugBody(body, { includeRawJson: true });
  assert.ok(snapshot);
  assert.equal(snapshot.rawJson, body);
  assert.equal(snapshot.summaryItems.length, 0);
});
