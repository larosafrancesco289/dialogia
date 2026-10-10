import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenBudgeter } from '@/lib/agent/prompt-builder/TokenBudgeter';

// About 4 characters a token: 400 characters is about 100 tokens.
const words = (tokens: number) => 'abcd'.repeat(tokens);

test('the newest messages that fit are kept, the oldest dropped first', () => {
  // 512 tokens is the least the budget allows, whatever the context.
  const budgeter = new TokenBudgeter(1024, 512);
  const kept = budgeter.budget([
    { content: words(300) },
    { content: words(300) },
    { content: words(150) },
  ]);
  assert.deepEqual(kept, [1, 2]);
});

test('what travels with a message counts toward it, and it goes whole', () => {
  const budgeter = new TokenBudgeter(1024, 512);
  const kept = budgeter.budget([
    { content: words(10), extraTokens: 400 },
    { content: words(10), extraTokens: 400 },
  ]);
  assert.deepEqual(kept, [1], 'the older message and its attachments go together');
});

test('the newest message is kept even when it alone is too long', () => {
  const budgeter = new TokenBudgeter(1024, 512);
  assert.deepEqual(budgeter.budget([{ content: words(100) }, { content: words(5000) }]), [1]);
  assert.deepEqual(budgeter.budget([{ content: 'hi', extraTokens: 10_000 }]), [0]);
});
