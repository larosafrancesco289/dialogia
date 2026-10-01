import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repository } from '@/lib/db';
import type { MemoryChange } from '@/lib/db/repository';
import { applyOperations } from '@/lib/memory/consolidate';
import { noteHandle } from '@/lib/memory/writes';
import { showVersion } from '@/lib/messages/versions';
import { registerMemoryTools } from '@/lib/tools/core/memoryTools';
import type { ToolExecutionContext } from '@/lib/tools/execution';
import { getToolHandler } from '@/lib/tools/registry';
import {
  NOTICE_CONSOLIDATION_PARTLY_UNDONE,
  NOTICE_MEMORY_CHANGED_SINCE,
  NOTICE_SAVE_FAILED,
} from '@/lib/store/notices';
import { MEMORY_ABOUT_FOLDER_ID, type MemoryWrite, type Message } from '@/lib/types';
import { createTestStore } from './helpers/createTestStoreState';

registerMemoryTools();

const writeMemory = repository.writeMemory;

/** Runs `run` with every memory write going through `replacement`, then puts the real one back. */
async function withWrites<T>(
  replacement: (change: MemoryChange) => Promise<void>,
  run: () => Promise<T>,
): Promise<T> {
  repository.writeMemory = replacement;
  try {
    return await run();
  } finally {
    repository.writeMemory = writeMemory;
  }
}

const failing = async () => {
  throw new Error('The transaction was aborted.');
};

/** A store with memory loaded and one empty reply, and a memory_save as that reply makes it. */
async function replyStore(id: string) {
  const store = createTestStore();
  await store.getState().loadMemory();
  const reply = { id, chatId: `chat-${id}`, role: 'assistant', content: '' } as Message;
  store.setState({
    messagesById: { [reply.id]: reply },
    messageIdsByChatId: { [reply.chatId]: [reply.id] },
  });
  const context = {
    chatId: reply.chatId,
    assistantMessage: reply,
    set: store.setState,
    get: store.getState,
    logger: { start: () => ({ success: () => undefined, error: () => undefined }) },
  } as unknown as ToolExecutionContext;
  const save = (args: Record<string, unknown>) =>
    getToolHandler('memory_save')!({
      toolCall: { id: 's', type: 'function', function: { name: 'memory_save', arguments: '{}' } },
      parsedArgs: args,
      aggregatedResults: [],
      context,
    });
  return { store, reply, save };
}

test('a save that cannot be written tells the model, and leaves no note to say it was saved', async () => {
  const { store, reply, save } = await replyStore('fail-save');
  const failed = await withWrites(failing, () => save({ folder: 'About you', note: 'Keeps bees' }));

  assert.equal(failed.result?.ok, false);
  assert.match(String(failed.result?.error), /could not be saved/);
  assert.equal(store.getState().ui.notice, NOTICE_SAVE_FAILED);
  assert.equal(store.getState().messagesById[reply.id].memoryWrites, undefined);
  // Memory is read again as stored, so trying again saves it rather than finding it "already saved".
  assert.ok(!store.getState().memory.notes.some((n) => n.text === 'Keeps bees'));
  const again = await save({ folder: 'About you', note: 'Keeps bees' });
  assert.equal(again.result?.action, 'added');
  assert.ok((await repository.loadMemory()).notes.some((n) => n.text === 'Keeps bees'));
});

test('an edit that cannot be written is put back as stored, and the person told', async () => {
  const store = createTestStore();
  await store.getState().loadMemory();
  const lyon = await store.getState().addMemoryNote(MEMORY_ABOUT_FOLDER_ID, 'Lives in Lyon');
  store.getState().setNotice(undefined);
  await withWrites(failing, () => store.getState().editMemoryNote(lyon!.id, 'Lives in Nice'));

  assert.equal(store.getState().memory.notes.find((n) => n.id === lyon!.id)?.text, 'Lives in Lyon');
  assert.equal(store.getState().ui.notice, NOTICE_SAVE_FAILED);
});

test('another tab’s change heard while this tab is writing is read in once the write lands', async () => {
  const store = createTestStore();
  await store.getState().loadMemory();
  let land!: () => void;
  const landed = new Promise<void>((resolve) => (land = resolve));
  const adding = await withWrites(
    async (change) => {
      await landed;
      await writeMemory(change);
    },
    async () => ({
      promise: store.getState().addMemoryNote(MEMORY_ABOUT_FOLDER_ID, 'Rides a tandem'),
    }),
  );
  await writeMemory({
    notes: [
      {
        id: 'other-tab-1',
        folderId: MEMORY_ABOUT_FOLDER_ID,
        text: 'Has a garden',
        author: 'user',
        createdAt: 1,
        updatedAt: 1,
      },
    ],
  });

  await store.getState().refreshMemory();
  const texts = () => store.getState().memory.notes.map((n) => n.text);
  assert.ok(texts().includes('Rides a tandem'), 'this tab’s own note stays while it is written');

  land();
  await adding.promise;
  assert.ok(texts().includes('Rides a tandem'));
  assert.ok(texts().includes('Has a garden'), 'the read waited for the write, then ran');
});

test('an Undo another tab got to first is refused as it is written, and the newer words kept', async () => {
  const { store, reply, save } = await replyStore('stale-undo');
  const milan = await store.getState().addMemoryNote(MEMORY_ABOUT_FOLDER_ID, 'Lives in Milan');
  await save({ folder: 'About you', note: 'Lives in Berlin', replaces: noteHandle(milan!.id) });
  // Another tab changes Berlin to Porto; this tab has not heard yet.
  const berlin = store.getState().memory.notes.find((n) => n.id === milan!.id)!;
  await writeMemory({
    notes: [{ ...berlin, text: 'Lives in Porto', author: 'user', updatedAt: berlin.updatedAt + 1 }],
  });

  await store.getState().undoMemoryWrite(reply.id, 0);
  const stored = (await repository.loadMemory()).notes.find((n) => n.id === milan!.id);
  assert.equal(stored?.text, 'Lives in Porto');
  assert.equal(
    store.getState().memory.notes.find((n) => n.id === milan!.id)?.text,
    'Lives in Porto',
  );
  assert.equal(store.getState().ui.notice, NOTICE_MEMORY_CHANGED_SINCE);
  assert.notEqual(store.getState().messagesById[reply.id].memoryWrites![0].undone, true);
});

test('a consolidation Undo another tab got to first takes back only what is still as it left it', async () => {
  const store = createTestStore();
  await store.getState().loadMemory();
  const cat = await store.getState().addMemoryNote(MEMORY_ABOUT_FOLDER_ID, 'Owns a cat');
  const tea = await store.getState().addMemoryNote(MEMORY_ABOUT_FOLDER_ID, 'Likes tea');
  const { change, lines, undo } = applyOperations({
    memory: store.getState().memory,
    now: 50,
    newId: () => 'unused-id',
    operations: [
      { op: 'rewrite', note: noteHandle(cat!.id), text: 'Owns one cat', say: 'Clarified the cat' },
      { op: 'rewrite', note: noteHandle(tea!.id), text: 'Likes green tea', say: 'Clarified tea' },
    ],
  });
  await store.getState().changeMemory({ ...change, pass: { at: 50, lines, undo, shown: true } });
  // Another tab edits the tea note; this tab has not heard yet.
  const green = store.getState().memory.notes.find((n) => n.id === tea!.id)!;
  await writeMemory({
    notes: [{ ...green, text: 'Likes black tea', author: 'user', updatedAt: 60 }],
  });

  await store.getState().undoConsolidation();
  const stored = await repository.loadMemory();
  assert.equal(stored.notes.find((n) => n.id === cat!.id)?.text, 'Owns a cat');
  assert.equal(stored.notes.find((n) => n.id === tea!.id)?.text, 'Likes black tea');
  assert.equal(stored.pass, undefined);
  assert.equal(store.getState().ui.notice, NOTICE_CONSOLIDATION_PARTLY_UNDONE);
});

test('a failed Undo gives the Undo back to the version that holds it, even after a switch', async () => {
  const store = createTestStore();
  await store.getState().loadMemory();
  const viola = await store.getState().addMemoryNote(MEMORY_ABOUT_FOLDER_ID, 'Plays viola');
  const cello = { ...viola!, text: 'Plays cello', author: 'model' as const, updatedAt: 9 };
  await store.getState().changeMemory({ notes: [cello] });
  const write: MemoryWrite = {
    noteId: cello.id,
    action: 'updated',
    text: 'Plays cello',
    folderId: MEMORY_ABOUT_FOLDER_ID,
    before: viola!,
  };
  const reply = {
    id: 'reply-switch',
    chatId: 'chat-switch',
    role: 'assistant',
    content: 'Second try',
    memoryWrites: [write],
    versions: [{ content: 'First try' }],
  } as Message;
  store.setState({
    messagesById: { [reply.id]: reply },
    messageIdsByChatId: { [reply.chatId]: [reply.id] },
  });

  await withWrites(
    async () => {
      await Promise.resolve();
      throw new Error('The transaction was aborted.');
    },
    async () => {
      const undoing = store.getState().undoMemoryWrite(reply.id, 0);
      store.setState((s) => ({
        messagesById: { [reply.id]: showVersion(s.messagesById[reply.id], 0) },
      }));
      await undoing;
    },
  );

  const shown = store.getState().messagesById[reply.id];
  assert.equal(shown.content, 'First try');
  assert.equal(shown.versions![0].memoryWrites![0], write, 'the line has its Undo back');
});
