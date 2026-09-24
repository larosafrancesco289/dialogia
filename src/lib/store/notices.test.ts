import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeErrorNotice } from '@/lib/store/notices';

test('a transport error code reads as words, keeping the status and the detail', () => {
  assert.equal(
    describeErrorNotice(new Error('openrouter_chat_failed (400): model not found')),
    'The model provider returned an error (400): model not found',
  );
});

test('a stop is not an error', () => {
  assert.equal(describeErrorNotice(new DOMException('aborted', 'AbortError')), undefined);
});
