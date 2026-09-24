import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryDb } from '@/lib/db/memory';
import { createRepository, TutorLogConflictError } from '@/lib/db/repository';
import { sanitizeTutorEventRecord } from '@/lib/db/sanitize';
import type { Chat, Message, TutorEventRecord } from '@/lib/types';

const chat = (id: string): Chat =>
  ({ id, title: id, createdAt: 1, updatedAt: 1, settings: {} }) as unknown as Chat;

const message = (id: string, chatId: string): Message => ({
  id,
  chatId,
  role: 'user',
  content: 'hi',
  createdAt: 1,
});

const event = (
  chatId: string,
  seq: number,
  extra: Partial<TutorEventRecord> = {},
): TutorEventRecord => ({
  id: `${chatId}-e${seq}`,
  chatId,
  seq,
  at: 1_000 + seq,
  by: 'tutor',
  type: 'topic_started',
  nodeId: 'limits',
  ...extra,
});

async function seeded() {
  const repo = createRepository(createMemoryDb());
  await repo.importAll({
    chats: [chat('a'), chat('b')],
    messages: [message('m1', 'a')],
  });
  return repo;
}

test('appended tutor events load back per chat in log order', async () => {
  const repo = await seeded();
  await repo.appendTutorEvents([event('a', 2), event('b', 1), event('a', 1)]);
  const events = await repo.loadTutorEvents('a');
  assert.deepEqual(
    events.map((e) => e.seq),
    [1, 2],
  );
  assert.equal(events[0].nodeId, 'limits');
  assert.equal((await repo.loadTutorEvents('b')).length, 1);
  assert.deepEqual(await repo.loadTutorEvents('none'), []);
});

test('deleting a chat deletes its tutor events and nobody else’s', async () => {
  const repo = await seeded();
  await repo.appendTutorEvents([event('a', 1), event('b', 1)]);
  await repo.deleteChatAndMessages('a');
  assert.deepEqual(await repo.loadTutorEvents('a'), []);
  assert.equal((await repo.loadTutorEvents('b')).length, 1);
});

test('tutor events round-trip through export and import', async () => {
  const repo = await seeded();
  await repo.appendTutorEvents([event('a', 1), event('a', 2)]);
  const exported = await repo.exportAll();
  assert.equal(exported.tutorEvents.length, 2);

  const fresh = createRepository(createMemoryDb());
  await fresh.importAll(JSON.parse(JSON.stringify(exported)));
  const events = await fresh.loadTutorEvents('a');
  assert.deepEqual(
    events.map((e) => e.id),
    ['a-e1', 'a-e2'],
  );
});

test('an export from before the event log still imports', async () => {
  const repo = createRepository(createMemoryDb());
  await repo.importAll({ chats: [chat('a')], messages: [message('m1', 'a')], folders: [] });
  const { chat: stored, messages } = await repo.getChatWithMessages('a');
  assert.equal(stored?.id, 'a');
  assert.equal(messages.length, 1);
  assert.deepEqual(await repo.loadTutorEvents('a'), []);
});

test('import drops malformed events, orphans and duplicates', async () => {
  const repo = createRepository(createMemoryDb());
  await repo.importAll({
    chats: [chat('a')],
    tutorEvents: [
      event('a', 1),
      event('a', 1), // same id again
      event('ghost', 1), // no such chat in the import
      { ...event('a', 2), seq: 0 },
      { ...event('a', 3), by: 'admin' },
      { ...event('a', 4), type: '' },
      { ...event('a', 5), at: 'yesterday' },
      'not an event',
      null,
      { ...event('a', 6), messageId: 42 },
    ],
  });
  const events = await repo.loadTutorEvents('a');
  assert.deepEqual(
    events.map((e) => e.id),
    ['a-e1', 'a-e6'],
  );
  assert.equal('messageId' in events[1], false);
});

test('an imported log replaces the chat’s local log instead of interleaving', async () => {
  const repo = await seeded();
  await repo.appendTutorEvents([
    event('a', 1, { id: 'local-1' }),
    event('a', 2, { id: 'local-2' }),
  ]);
  await repo.importAll({ chats: [chat('a')], tutorEvents: [event('a', 1, { id: 'imported-1' })] });
  const events = await repo.loadTutorEvents('a');
  assert.deepEqual(
    events.map((e) => e.id),
    ['imported-1'],
  );
});

test('an append at a position holding another event writes nothing and says so', async () => {
  const repo = await seeded();
  await repo.appendTutorEvents([event('a', 1), event('a', 2)]);
  // The same events again are a no-op rewrite.
  await repo.appendTutorEvents([event('a', 2)]);
  await assert.rejects(
    repo.appendTutorEvents([event('a', 3), event('a', 2, { id: 'other-tab' })]),
    TutorLogConflictError,
  );
  assert.deepEqual(
    (await repo.loadTutorEvents('a')).map((e) => e.id),
    ['a-e1', 'a-e2'],
    'not even the free position was written',
  );
  // Another chat's positions are its own.
  await repo.appendTutorEvents([event('b', 1)]);
});

test('seeding a log writes only while it is empty', async () => {
  const repo = await seeded();
  assert.equal(await repo.seedTutorEvents('a', [event('a', 1, { id: 'first' })]), true);
  assert.equal(await repo.seedTutorEvents('a', [event('a', 1, { id: 'second' })]), false);
  assert.deepEqual(
    (await repo.loadTutorEvents('a')).map((e) => e.id),
    ['first'],
  );
});

test('export leaves out events whose chat is gone, and import keeps one event per position', async () => {
  const repo = await seeded();
  await repo.appendTutorEvents([event('a', 1), event('deleted', 1)]);
  const exported = await repo.exportAll();
  assert.deepEqual(
    exported.tutorEvents.map((e) => e.chatId),
    ['a'],
  );

  const fresh = createRepository(createMemoryDb());
  await fresh.importAll({
    chats: [chat('a')],
    tutorEvents: [event('a', 1), event('a', 1, { id: 'same-position' }), event('a', 2)],
  });
  assert.deepEqual(
    (await fresh.loadTutorEvents('a')).map((e) => e.id),
    ['a-e1', 'a-e2'],
  );
});

test('sanitizeTutorEventRecord keeps the payload and checks only the envelope', () => {
  const kept = sanitizeTutorEventRecord({ ...event('a', 1), anything: { nested: true } });
  assert.deepEqual(kept?.anything, { nested: true });
  assert.equal(sanitizeTutorEventRecord({ ...event('a', 1), seq: 1.5 }), undefined);
  assert.equal(sanitizeTutorEventRecord({ ...event('a', 1), chatId: '' }), undefined);
});
