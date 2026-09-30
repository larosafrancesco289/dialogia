import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repository } from '@/lib/db';
import {
  FORGOTTEN_RETENTION_MS,
  expiredNotes,
  forgottenNotes,
  missingBuiltInFolders,
  notesIn,
  orderedFolders,
  repairs,
} from '@/lib/memory/notebook';
import { connectTabSync } from '@/lib/store/tabSync';
import { createTabChannel, parseAnnouncement } from '@/lib/sync/tabChannel';
import {
  MEMORY_ABOUT_FOLDER_ID,
  MEMORY_LEARNING_FOLDER_ID,
  type MemoryFolder,
  type MemoryNote,
  type Message,
} from '@/lib/types';
import { createFakeBus } from './helpers/fakeTabBus';
import { createTestStore } from './helpers/createTestStoreState';

const folder = (id: string, name: string, parentId?: string): MemoryFolder => ({
  id,
  name,
  description: '',
  createdAt: 1,
  updatedAt: 1,
  ...(parentId ? { parentId } : {}),
});

const note = (id: string, folderId: string, extra: Partial<MemoryNote> = {}): MemoryNote => ({
  id,
  folderId,
  text: id,
  author: 'user',
  createdAt: 1,
  updatedAt: 1,
  ...extra,
});

/** Empties memory, so each test starts from a first run. */
async function clearMemory() {
  const { folders, notes } = await repository.loadMemory();
  await repository.writeMemory({ deleteNoteIds: notes.map((n) => n.id) });
  const table = (await import('@/lib/db')).db.memoryFolders;
  for (const f of folders) await table.delete(f.id);
}

test('a first run gets the two built-in folders, and only the missing ones', () => {
  const both = missingBuiltInFolders([], 5);
  assert.deepEqual(
    both.map((f) => f.id),
    [MEMORY_ABOUT_FOLDER_ID, MEMORY_LEARNING_FOLDER_ID],
  );
  const renamed = { ...both[0], name: 'About me' };
  assert.deepEqual(
    missingBuiltInFolders([renamed], 5).map((f) => f.id),
    [MEMORY_LEARNING_FOLDER_ID],
  );
});

test('folders read built-ins first, then by name, each followed by its subfolders', () => {
  const ordered = orderedFolders([
    folder('projects', 'Projects'),
    folder('thesis', 'PhD thesis', 'projects'),
    folder(MEMORY_LEARNING_FOLDER_ID, 'Learning'),
    folder('kitchen', 'Kitchen'),
    folder(MEMORY_ABOUT_FOLDER_ID, 'About you'),
    folder('orphan', 'Orphan', 'gone'),
  ]);
  assert.deepEqual(
    ordered.map(({ folder: f, depth }) => `${depth}:${f.id}`),
    ['0:about', '0:learning', '0:kitchen', '0:orphan', '0:projects', '1:thesis'],
  );
});

test('a forgotten note leaves its folder, waits, then expires', () => {
  const now = 10 * FORGOTTEN_RETENTION_MS;
  const notes = [
    note('kept', 'about'),
    note('recent', 'about', { forgottenAt: now - 1000 }),
    note('old', 'about', { forgottenAt: now - FORGOTTEN_RETENTION_MS }),
  ];
  assert.deepEqual(
    notesIn(notes, 'about').map((n) => n.id),
    ['kept'],
  );
  assert.deepEqual(
    forgottenNotes(notes).map((n) => n.id),
    ['recent', 'old'],
  );
  assert.deepEqual(
    expiredNotes(notes, now).map((n) => n.id),
    ['old'],
  );
});

test('loading memory saves the built-in folders and lets expired notes go', async () => {
  await clearMemory();
  const longAgo = Date.now() - FORGOTTEN_RETENTION_MS - 1;
  await repository.writeMemory({
    notes: [note('expired', 'about', { forgottenAt: longAgo }), note('live', 'about')],
  });
  const store = createTestStore();
  await store.getState().loadMemory();

  const { memory } = store.getState();
  assert.equal(memory.loaded, true);
  assert.deepEqual(memory.notes.map((n) => n.id).sort(), ['live']);
  const stored = await repository.loadMemory();
  assert.deepEqual(stored.folders.map((f) => f.id).sort(), [
    MEMORY_ABOUT_FOLDER_ID,
    MEMORY_LEARNING_FOLDER_ID,
  ]);
  assert.deepEqual(
    stored.notes.map((n) => n.id),
    ['live'],
  );
});

test('a folder inside itself or under a missing one goes to the top, a lost note to About you', () => {
  const folders = [
    folder(MEMORY_ABOUT_FOLDER_ID, 'About you'),
    folder('a', 'A', 'b'),
    folder('b', 'B', 'a'),
    folder('c', 'C', 'a'),
    folder('orphan', 'Orphan', 'gone'),
    folder('self', 'Self', 'self'),
    folder('kid', 'Kid', 'orphan'),
  ];
  const mended = repairs(folders, [note('kept', 'kid'), note('lost', 'gone')]);
  assert.deepEqual(
    mended.folders.map((f) => [f.id, f.parentId]),
    [
      ['a', undefined],
      ['b', undefined],
      ['orphan', undefined],
      ['self', undefined],
    ],
  );
  assert.deepEqual(
    mended.notes.map((n) => [n.id, n.folderId]),
    [['lost', MEMORY_ABOUT_FOLDER_ID]],
  );
  assert.deepEqual(repairs([folder('x', 'X')], [note('n', 'x')]), { folders: [], notes: [] });
});

test('loading memory saves its repairs; reading another tab’s change saves nothing', async () => {
  await clearMemory();
  const store = createTestStore();
  await store.getState().loadMemory();
  await repository.writeMemory({
    folders: [folder('loop', 'Loop', 'loop')],
    notes: [note('lost', 'gone')],
  });

  await store.getState().refreshMemory();
  const unsaved = await repository.loadMemory();
  assert.equal(unsaved.folders.find((f) => f.id === 'loop')?.parentId, 'loop');
  assert.equal(unsaved.notes.find((n) => n.id === 'lost')?.folderId, 'gone');

  await store.getState().loadMemory();
  const saved = await repository.loadMemory();
  assert.equal(saved.folders.find((f) => f.id === 'loop')?.parentId, undefined);
  assert.equal(saved.notes.find((n) => n.id === 'lost')?.folderId, MEMORY_ABOUT_FOLDER_ID);
  assert.deepEqual(store.getState().memory.folders, saved.folders);
});

test('adding, editing, forgetting and restoring a note are all saved', async () => {
  await clearMemory();
  const store = createTestStore();
  await store.getState().loadMemory();

  const added = await store.getState().addMemoryNote(MEMORY_ABOUT_FOLDER_ID, '  Lives in Berlin ', {
    author: 'model',
    sourceChatId: 'chat-1',
  });
  assert.ok(added);
  assert.equal(added.text, 'Lives in Berlin');
  assert.equal(await store.getState().addMemoryNote(MEMORY_ABOUT_FOLDER_ID, '   '), undefined);

  await store.getState().editMemoryNote(added.id, 'Lives in Berlin, in Kreuzberg');
  const edited = (await repository.loadMemory()).notes.find((n) => n.id === added.id);
  assert.equal(edited?.text, 'Lives in Berlin, in Kreuzberg');
  assert.equal(edited?.author, 'user', 'the words are now the person’s');
  assert.equal(edited?.sourceChatId, 'chat-1');

  await store.getState().forgetMemoryNote(added.id);
  assert.equal(notesIn(store.getState().memory.notes, MEMORY_ABOUT_FOLDER_ID).length, 0);
  assert.ok((await repository.loadMemory()).notes[0].forgottenAt);

  await store.getState().restoreMemoryNote(added.id);
  const restored = (await repository.loadMemory()).notes[0];
  assert.equal(restored.forgottenAt, undefined);
  assert.equal(notesIn(store.getState().memory.notes, MEMORY_ABOUT_FOLDER_ID).length, 1);
});

test('a folder’s index line can be edited; its name never goes blank', async () => {
  await clearMemory();
  const store = createTestStore();
  await store.getState().loadMemory();
  await store
    .getState()
    .editMemoryFolder(MEMORY_ABOUT_FOLDER_ID, { name: '  ', description: 'Home and work' });
  const saved = (await repository.loadMemory()).folders.find(
    (f) => f.id === MEMORY_ABOUT_FOLDER_ID,
  );
  assert.equal(saved?.name, 'About you');
  assert.equal(saved?.description, 'Home and work');
});

test('a backup carries memory, and rows that cannot be trusted are left out', async () => {
  await clearMemory();
  await repository.writeMemory({
    folders: [folder('kitchen', 'Kitchen')],
    notes: [note('walnuts', 'kitchen', { text: 'Allergic to walnuts', author: 'model' })],
  });
  const backup = await repository.exportAll();
  assert.deepEqual(
    backup.memoryNotes.map((n) => n.id),
    ['walnuts'],
  );

  await clearMemory();
  await repository.importAll({
    ...backup,
    memoryNotes: [
      ...backup.memoryNotes,
      {
        id: 'bad-author',
        folderId: 'kitchen',
        text: 'x',
        author: 'robot',
        createdAt: 1,
        updatedAt: 1,
      },
      { id: 'blank', folderId: 'kitchen', text: '  ', author: 'user', createdAt: 1, updatedAt: 1 },
    ],
  });
  const restored = await repository.loadMemory();
  assert.deepEqual(
    restored.notes.map((n) => n.id),
    ['walnuts'],
  );
  assert.deepEqual(
    restored.folders.map((f) => f.id),
    ['kitchen'],
  );

  // A backup from before memory still imports.
  await repository.importAll({ chats: [], messages: [] });
});

test('a backup’s record of a reply’s memory writes keeps only entries Undo can trust', async () => {
  const good = { noteId: 'n1', action: 'added', text: 'Has a cat', folderId: 'about' };
  const updated = {
    noteId: 'n2',
    action: 'updated',
    text: 'Lives in Rome',
    folderId: 'about',
    before: note('n2', 'about', { text: 'Lives in Milan' }),
  };
  const writes = [
    good,
    updated,
    { ...updated, before: note('someone-else', 'about') },
    { ...good, action: 'rewrote' },
    { ...good, noteId: 42 },
    { ...updated, before: undefined },
    'nonsense',
  ];
  const chat = { id: 'chat-w', title: 'W', createdAt: 1, updatedAt: 1, settings: {} };
  const reply = {
    id: 'reply-w',
    chatId: 'chat-w',
    role: 'assistant',
    content: 'Second',
    createdAt: 2,
    memoryWrites: writes,
    versions: [{ content: 'First', memoryWrites: [...writes] }],
  };
  await repository.importAll({ chats: [chat], messages: [reply] });
  const { messages } = await repository.getChatWithMessages('chat-w');
  const [stored] = messages as Message[];
  assert.deepEqual(stored.memoryWrites, [good, updated]);
  assert.deepEqual(stored.versions?.[0]?.memoryWrites, [good, updated]);
});

test('another tab’s memory change is read in, and never written back', async () => {
  await clearMemory();
  assert.deepEqual(parseAnnouncement({ kind: 'memory' }), { kind: 'memory' });

  const bus = createFakeBus();
  const options = { now: () => 1, every: () => () => undefined };
  const writer = createTestStore();
  const reader = createTestStore();
  const writerChannel = createTabChannel(bus.open);
  const readerChannel = createTabChannel(bus.open);
  const readerSync = connectTabSync(reader, readerChannel, options);
  connectTabSync(writer, writerChannel, options);
  const heardByWriter: unknown[] = [];
  writerChannel.subscribe((announcement) => heardByWriter.push(announcement));

  await writer.getState().loadMemory();
  await writer.getState().addMemoryNote(MEMORY_ABOUT_FOLDER_ID, 'Vegetarian on weekdays');
  // In Node the repository's own announcement goes nowhere; post what it would have.
  writerChannel.post({ kind: 'memory' });
  await bus.settle();
  await readerSync.idle();

  assert.deepEqual(
    reader.getState().memory.notes.map((n) => n.text),
    ['Vegetarian on weekdays'],
  );
  await bus.settle();
  assert.deepEqual(heardByWriter, [], 'the reading tab announced nothing back');
});
