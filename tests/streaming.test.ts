import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripLeadingToolJson } from '@/lib/agent/streaming';

test('stripLeadingToolJson removes fenced JSON blocks', () => {
  const input = '```json\n{"name":"web_search","arguments":{"query":"hello"}}\n```\nAnswer';
  assert.equal(stripLeadingToolJson(input), 'Answer');
});

test('stripLeadingToolJson leaves regular text', () => {
  const input = 'Plain response from model';
  assert.equal(stripLeadingToolJson(input), 'Plain response from model');
});
