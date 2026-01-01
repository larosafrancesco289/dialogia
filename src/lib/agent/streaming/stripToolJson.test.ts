import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripLeadingToolJson } from '@/lib/agent/streaming/stripToolJson';

test('stripLeadingToolJson removes fenced tool payloads', () => {
  const input = '```json\n{"tool":"call"}\n```\nFinal answer.';
  assert.equal(stripLeadingToolJson(input), 'Final answer.');
});

test('stripLeadingToolJson ignores non-tool fences', () => {
  const input = '```markdown\n# Title\n```\nKeep this.';
  assert.equal(stripLeadingToolJson(input), input);
});

test('stripLeadingToolJson removes leading JSON objects', () => {
  const input = '{"tool":"call","args":{"q":"x"}}\nResult text.';
  assert.equal(stripLeadingToolJson(input), 'Result text.');
});

test('stripLeadingToolJson keeps plain text intact', () => {
  const input = 'Just some text without JSON.';
  assert.equal(stripLeadingToolJson(input), input);
});
