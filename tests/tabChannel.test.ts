import { test } from 'node:test';
import assert from 'node:assert/strict';
import { announceWrites } from '@/lib/db/announce';
import { createMemoryDb } from '@/lib/db/memory';
import { createRepository } from '@/lib/db/repository';
import { createTabChannel, parseAnnouncement, type TabAnnouncement } from '@/lib/sync/tabChannel';
import { createAssistantMessage, createUserMessage } from '@/lib/messages/createMessage';
import type { Folder } from '@/lib/types';
import { createFakeBus } from './helpers/fakeTabBus';
import { makeChat } from './helpers/makeChat';

const chat = (id: string) => makeChat({ id });

test('a channel without a port does nothing and never throws', () => {
  const channel = createTabChannel(() => undefined);
  const heard: TabAnnouncement[] = [];
  const unsubscribe = channel.subscribe((a) => heard.push(a));
  channel.post({ kind: 'hello' });
  unsubscribe();
  assert.deepEqual(heard, []);

  const broken = createTabChannel(() => {
    throw new Error('no BroadcastChannel here');
  });
  broken.post({ kind: 'hello' });
});

test('an announcement reaches the other tabs, not the sender', async () => {
  const bus = createFakeBus();
  const a = createTabChannel(bus.open);
  const b = createTabChannel(bus.open);
  const heardA: TabAnnouncement[] = [];
  const heardB: TabAnnouncement[] = [];
  a.subscribe((x) => heardA.push(x));
  b.subscribe((x) => heardB.push(x));
  a.post({ kind: 'chats', ids: ['c1'] });
  await bus.settle();
  assert.deepEqual(heardA, []);
  assert.deepEqual(heardB, [{ kind: 'chats', ids: ['c1'] }]);
});

test('what another build sends is checked, and anything unknown is dropped', () => {
  assert.equal(parseAnnouncement({ kind: 'chats', ids: 'c1' }), undefined);
  assert.equal(parseAnnouncement({ kind: 'messages', ids: ['m1'] }), undefined);
  assert.equal(parseAnnouncement({ kind: 'streaming', chatId: 'c', replyIds: [] }), undefined);
  assert.equal(parseAnnouncement({ kind: 'something-new' }), undefined);
  assert.equal(parseAnnouncement('chats'), undefined);
  assert.deepEqual(parseAnnouncement({ kind: 'chatDeleted', id: 'c1', content: 'x' }), {
    kind: 'chatDeleted',
    id: 'c1',
  });
});

test('every repository write is announced after it lands, with ids and never content', async () => {
  const posted: TabAnnouncement[] = [];
  const repository = announceWrites(createRepository(createMemoryDb()), (a) => posted.push(a));
  const user = createUserMessage({ chatId: 'c1', content: 'secret words', createdAt: 1 });
  const reply = createAssistantMessage({ chatId: 'c1', content: 'more words', createdAt: 2 });
  const folder: Folder = { id: 'f1', name: 'F', createdAt: 1, updatedAt: 1, isExpanded: true };

  await repository.saveChat(chat('c1'));
  await repository.saveMessages([user, reply]);
  await repository.saveMessage(reply);
  await repository.saveFolder(folder);
  await repository.saveChatWithMessages(chat('c2'), [{ ...user, id: 'u2', chatId: 'c2' }]);
  await repository.deleteFolder('f1');
  await repository.deleteChatAndMessages('c2');
  await repository.importAll({});

  assert.deepEqual(posted, [
    { kind: 'chats', ids: ['c1'] },
    { kind: 'messages', chatId: 'c1', ids: [user.id, reply.id] },
    { kind: 'messages', chatId: 'c1', ids: [reply.id] },
    { kind: 'folders', ids: ['f1'] },
    { kind: 'chats', ids: ['c2'] },
    { kind: 'messages', chatId: 'c2', ids: ['u2'] },
    { kind: 'folderDeleted', id: 'f1' },
    { kind: 'chatDeleted', id: 'c2' },
    { kind: 'replaced' },
  ]);
  assert.ok(!JSON.stringify(posted).includes('words'));

  // What a receiving tab reads back.
  assert.deepEqual(
    (await repository.loadMessages([user.id, 'gone'])).map((m) => m.id),
    [user.id],
  );
  assert.deepEqual(
    (await repository.loadChats(['c1', 'c2'])).map((c) => c.id),
    ['c1'],
  );
});

test('a write that fails announces nothing', async () => {
  const posted: TabAnnouncement[] = [];
  const inner = createRepository(createMemoryDb());
  inner.saveChat = async () => {
    throw new Error('disk full');
  };
  const repository = announceWrites(inner, (a) => posted.push(a));
  await assert.rejects(repository.saveChat(chat('c1')));
  assert.deepEqual(posted, []);
});

test('tutor log writes announce the chat whose log changed', async () => {
  const posted: TabAnnouncement[] = [];
  const repository = announceWrites(createRepository(createMemoryDb()), (a) => posted.push(a));
  const event = { id: 'e1', chatId: 'c1', seq: 1, at: 1, by: 'tutor', type: 'x' } as never;
  await repository.appendTutorEvents([event]);
  assert.equal(await repository.seedTutorEvents('c1', [event]), false, 'log already had events');
  await repository.deleteTutorEvents('c1');
  assert.deepEqual(posted, [
    { kind: 'tutorEvents', chatId: 'c1' },
    { kind: 'tutorEvents', chatId: 'c1' },
  ]);
});
