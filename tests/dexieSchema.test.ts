// The real IndexedDB schema, run against fake-indexeddb: its upgrades and the
// constraints the repository relies on. Elsewhere tests use the in-memory
// database, which has neither, so only this file proves a user's stored data
// survives an upgrade and a log position cannot be taken twice.

import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Dexie from 'dexie';
// As the app does: the database module first, which loads the schema without a cycle.
import '@/lib/db';
import { createDexieDb } from '@/lib/db/dexie';
import { createRepository, TutorLogConflictError } from '@/lib/db/repository';
import { DB_SCHEMA_VERSION } from '@/lib/db/versions';
import type { TutorEventRecord } from '@/lib/types';

let names = 0;
const freshName = () => `dialogia-test-${Date.now()}-${(names += 1)}`;

const event = (id: string, chatId: string, seq: number) =>
  ({ id, chatId, seq, at: seq, by: 'tutor', type: 'plan_approved' }) as unknown as TutorEventRecord;

test('a database from schema 2 opens at the current version with its chats and messages migrated', async () => {
  const name = freshName();
  const old = new Dexie(name);
  old
    .version(1)
    .stores({ chats: 'id, updatedAt, createdAt', messages: 'id, chatId, createdAt', kv: 'key' });
  old.version(2).stores({
    chats: 'id, updatedAt, createdAt, folderId',
    messages: 'id, chatId, createdAt',
    folders: 'id, updatedAt, createdAt, parentId',
    kv: 'key',
  });
  await old.open();
  await old.table('chats').put({ id: 'c1', title: 'From long ago', createdAt: 1, updatedAt: 1 });
  await old.table('messages').put({
    id: 'm1',
    chatId: 'c1',
    role: 'assistant',
    content: 'Hello',
    createdAt: 2,
    genSettings: { max_tokens: 512, reasoning: { effort: 'high' } },
  });
  await old.table('kv').put({ key: 'kept', value: 42 });
  old.close();

  const db = createDexieDb(name);
  await db.open();
  assert.equal(db.verno, DB_SCHEMA_VERSION);
  for (const table of ['tutorEvents', 'memoryFolders', 'memoryNotes']) {
    assert.ok(
      db.tables.some((t) => t.name === table),
      `${table} exists after the upgrade`,
    );
  }

  const chat = await db.chats.get('c1');
  assert.equal(chat?.title, 'From long ago');
  assert.equal(typeof chat?.settings?.modelId, 'string', 'a chat without settings gets them');

  const message = await db.messages.get('m1');
  assert.equal(message?.content, 'Hello');
  assert.deepEqual(
    { maxTokens: message?.genSettings?.maxTokens, effort: message?.genSettings?.reasoningEffort },
    { maxTokens: 512, effort: 'high' },
    'snake_case and nested generation settings are rewritten',
  );
  assert.equal((await db.kv.get('kept'))?.value, 42);
  db.close();
});

test('the unique log index refuses a second event at a taken position, as the repository’s backstop', async () => {
  const db = createDexieDb(freshName());
  await db.open();
  await db.tutorEvents.put(event('e1', 'c1', 1));
  await assert.rejects(db.tutorEvents.add(event('e2', 'c1', 1)), (error: Error) =>
    /Constraint/.test(error.name),
  );
  db.close();
});

test('appending tutor events is all or nothing on the real database', async () => {
  const db = createDexieDb(freshName());
  await db.open();
  const repository = createRepository(db);
  await repository.appendTutorEvents([event('e1', 'c1', 1), event('e2', 'c1', 2)]);

  // Position 3 is free, position 2 is not: nothing of the batch may land.
  await assert.rejects(
    repository.appendTutorEvents([event('e3', 'c1', 3), event('other', 'c1', 2)]),
    TutorLogConflictError,
  );
  const stored = await repository.loadTutorEvents('c1');
  assert.deepEqual(
    stored.map((e) => e.id),
    ['e1', 'e2'],
  );

  // A repeated id is the same event written again, not a conflict.
  await repository.appendTutorEvents([event('e2', 'c1', 2), event('e3', 'c1', 3)]);
  assert.equal((await repository.loadTutorEvents('c1')).length, 3);
  db.close();
});

test('a transaction that throws leaves nothing behind on the real database', async () => {
  const db = createDexieDb(freshName());
  await db.open();
  await assert.rejects(
    db.transaction('rw', db.chats, db.messages, async () => {
      await db.chats.put({ id: 'half', title: 'Half', createdAt: 1, updatedAt: 1 } as never);
      throw new Error('stop');
    }),
  );
  assert.equal(await db.chats.get('half'), undefined);
  db.close();
});
