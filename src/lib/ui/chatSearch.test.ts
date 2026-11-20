import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMessageExcerpt,
  buildMessageHits,
  searchChats,
  tokenizeQuery,
} from '@/lib/ui/chatSearch';
import { createMemoryDb } from '@/lib/db/memory';
import { createRepository } from '@/lib/db/repository';
import { makeChat } from '../../../tests/helpers/makeChat';

test('tokenizeQuery splits whitespace, lowercases, and deduplicates', () => {
  assert.deepEqual(tokenizeQuery('  Rust   Ownership rust  '), ['rust', 'ownership']);
  assert.deepEqual(tokenizeQuery('   '), []);
});

test('searchChats orders by recency and matches all query words', () => {
  const chats = [
    makeChat({ id: 'old', title: 'Rust borrow checker', updatedAt: 100 }),
    makeChat({ id: 'mid', title: 'Cooking pasta', updatedAt: 200 }),
    makeChat({ id: 'new', title: 'Rust async traits', updatedAt: 300 }),
  ];

  assert.deepEqual(
    searchChats(chats, '').map((c) => c.id),
    ['new', 'mid', 'old'],
  );
  assert.deepEqual(
    searchChats(chats, 'rust borrow').map((c) => c.id),
    ['old'],
  );
});

test('buildMessageExcerpt strips markdown and centres the window around the match', () => {
  const markdown = `${'Introductory words before the interesting bit. '.repeat(5)}Here is **quantum entanglement** explained clearly.${' Trailing words after the match.'.repeat(4)}`;
  const excerpt = buildMessageExcerpt(markdown, ['quantum'], 90);
  assert.ok(excerpt.includes('quantum entanglement'));
  assert.ok(!excerpt.includes('**'), 'markdown emphasis is stripped');
  assert.ok(excerpt.startsWith('…'));
  assert.ok(excerpt.endsWith('…'));
});

test('buildMessageHits caps hits per chat, dedupes by id, and skips deleted chats', () => {
  const chats = [
    makeChat({ id: 'c1', title: 'Physics' }),
    makeChat({ id: 'c2', title: 'Chemistry' }),
  ];
  const records = [
    { id: 'm1', chatId: 'c1', role: 'assistant' as const, content: 'photon energy', createdAt: 10 },
    { id: 'm2', chatId: 'c1', role: 'assistant' as const, content: 'photon spin', createdAt: 20 },
    { id: 'm3', chatId: 'c1', role: 'user' as const, content: 'photon mass', createdAt: 30 },
    { id: 'm3', chatId: 'c1', role: 'user' as const, content: 'photon mass', createdAt: 30 },
    {
      id: 'm4',
      chatId: 'c2',
      role: 'assistant' as const,
      content: 'photon absorption',
      createdAt: 15,
    },
    {
      id: 'm5',
      chatId: 'gone',
      role: 'assistant' as const,
      content: 'photon orphan',
      createdAt: 40,
    },
  ];

  const hits = buildMessageHits(records, chats, 'photon', { maxPerChat: 2 });
  assert.deepEqual(
    hits.map((h) => h.messageId),
    ['m3', 'm2', 'm4'],
  );
  assert.equal(hits[0]?.chatTitle, 'Physics');
});

test('repository.searchMessages searches stored messages and attached text while skipping hidden rows', async () => {
  const repo = createRepository(createMemoryDb());
  await repo.saveMessages([
    {
      id: 'visible',
      chatId: 'c1',
      role: 'assistant',
      content: 'Use IndexedDB cursors for fast scans.',
      createdAt: 10,
    },
    {
      id: 'hidden',
      chatId: 'c1',
      role: 'user',
      content: 'IndexedDB hidden prompt',
      createdAt: 20,
      metadata: { hiddenFromUser: true },
    },
    {
      id: 'ledger',
      chatId: 'c1',
      role: 'user',
      content: 'IndexedDB ledger click',
      createdAt: 25,
      ledger: true,
    },
    {
      id: 'attached',
      chatId: 'c2',
      role: 'user',
      content: 'Check this file',
      createdAt: 30,
      attachments: [
        {
          id: 'a1',
          kind: 'text',
          name: 'schema.ts',
          mime: 'text/plain',
          text: 'export const db = "IndexedDB";',
        },
      ],
    },
  ]);

  const hits = await repo.searchMessages('indexeddb');
  assert.deepEqual(
    hits.map((h) => h.id),
    ['attached', 'visible'],
  );
});
