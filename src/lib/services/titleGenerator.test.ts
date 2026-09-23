import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackChatTitle, triggerAsyncTitleGeneration } from './titleGenerator';
import type { ProviderEndpoint } from '@/lib/transport/endpoints';

test('fallback title is the first line, plain and capitalized', () => {
  assert.equal(fallbackChatTitle('how do I keep basil alive?'), 'How do I keep basil alive?');
  assert.equal(
    fallbackChatTitle('\n\n## **Refactor** the `auth` module\nmore'),
    'Refactor the auth module',
  );
  assert.equal(fallbackChatTitle('   \n  '), null);
});

test('fallback title cuts long messages at a word boundary', () => {
  const title = fallbackChatTitle(
    'I have been thinking about whether to move my whole team from Jira to Linear this quarter',
  );
  assert.equal(title, 'I have been thinking about whether to move my whole team…');
});

test('a chat with titling turned off is named after its first message', async () => {
  const endpoint = {
    id: 'mine',
    kind: 'openai-compatible',
    disableTitleGeneration: true,
  } as ProviderEndpoint;
  const renamed: string[] = [];
  await new Promise<void>((resolve) => {
    triggerAsyncTitleGeneration(
      'c1',
      'what should I cook tonight?',
      async (_id, title) => {
        renamed.push(title);
        resolve();
      },
      endpoint,
    );
  });
  assert.deepEqual(renamed, ['What should I cook tonight?']);
});
