import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanGeneratedTitle,
  fallbackChatTitle,
  triggerAsyncTitleGeneration,
} from './titleGenerator';
import { OPENROUTER_ENDPOINT, type ProviderEndpoint } from '@/lib/transport/endpoints';

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

test('a title model the gate refuses is never called, and the chat keeps its first message', async () => {
  const checked: string[] = [];
  const renamed: string[] = [];
  await new Promise<void>((resolve) => {
    triggerAsyncTitleGeneration(
      'c1',
      'plan a week in Lisbon',
      async (_id, title) => {
        renamed.push(title);
        resolve();
      },
      OPENROUTER_ENDPOINT,
      true,
      'anthropic/claude-opus-5',
      [],
      async (modelId) => {
        checked.push(modelId);
        return false;
      },
    );
  });
  // The gate sees the cheap title model, not the chat's own.
  assert.deepEqual(checked, ['openai/gpt-6-luna']);
  assert.deepEqual(renamed, ['Plan a week in Lisbon']);
});

test('a fallback title keeps the words as written, without markdown', () => {
  assert.equal(fallbackChatTitle('What is 2\\*3\\*4?'), 'What is 2*3*4?');
  assert.equal(fallbackChatTitle('fix my_var_name please'), 'Fix my_var_name please');
  assert.equal(fallbackChatTitle('-5 degrees tonight'), '-5 degrees tonight');
  assert.equal(fallbackChatTitle('`useEffect` runs twice'), 'useEffect runs twice');
  assert.equal(fallbackChatTitle('## Budget for \\$500\n\nmore'), 'Budget for $500');
  assert.equal(fallbackChatTitle('- **first** point'), 'First point');
});

test('a generated title loses its quotes, label and markdown', () => {
  assert.equal(cleanGeneratedTitle('“Planning a week in Lisbon”'), 'Planning a week in Lisbon');
  assert.equal(cleanGeneratedTitle('Title: **Budget** for \\$500.'), 'Budget for $500');
  assert.equal(cleanGeneratedTitle('"Why is the sky blue?"'), 'Why is the sky blue?');
});
