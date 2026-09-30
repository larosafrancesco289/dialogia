import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeTurn } from '@/lib/agent/compose';
import { repository } from '@/lib/db';
import { buildMemoryPreamble } from '@/lib/memory/prompt';
import { forgottenNotes } from '@/lib/memory/notebook';
import {
  markWriteUndone,
  noteHandle,
  planForget,
  planSave,
  resolveFolder,
  resolveNote,
  undoChange,
} from '@/lib/memory/writes';
import { showVersion } from '@/lib/messages/versions';
import { createModelIndex } from '@/lib/models';
import { resolveTurnSettings } from '@/lib/settings/resolve';
import { registerMemoryTools } from '@/lib/tools/core/memoryTools';
import type { ToolExecutionContext } from '@/lib/tools/execution';
import { getToolHandler } from '@/lib/tools/registry';
import {
  MEMORY_ABOUT_FOLDER_ID,
  MEMORY_LEARNING_FOLDER_ID,
  type MemoryFolder,
  type MemoryNote,
  type Message,
} from '@/lib/types';
import { createTestStore } from './helpers/createTestStoreState';
import { makeChat } from './helpers/makeChat';

registerMemoryTools();

const folder = (id: string, name: string, parentId?: string): MemoryFolder => ({
  id,
  name,
  description: `${name} things`,
  createdAt: 1,
  updatedAt: 1,
  ...(parentId ? { parentId } : {}),
});

const note = (id: string, folderId: string, text = id): MemoryNote => ({
  id,
  folderId,
  text,
  author: 'user',
  createdAt: 1,
  updatedAt: 1,
});

const memory = () => ({
  folders: [
    folder(MEMORY_ABOUT_FOLDER_ID, 'About you'),
    folder(MEMORY_LEARNING_FOLDER_ID, 'Learning'),
    folder('projects', 'Projects'),
    folder('thesis', 'PhD thesis', 'projects'),
  ],
  notes: [note('milan-0001', MEMORY_ABOUT_FOLDER_ID, 'Lives in Milan')],
});

let ids = 0;
const newId = () => `new-${(ids += 1)}`.padEnd(12, '0');

test('a folder is found by id, by path, or by a name only it has', () => {
  const { folders } = memory();
  assert.equal(resolveFolder(folders, 'about')?.id, 'about');
  assert.equal(resolveFolder(folders, 'projects / phd thesis')?.id, 'thesis');
  assert.equal(resolveFolder(folders, 'Projects › PhD thesis')?.id, 'thesis');
  assert.equal(resolveFolder(folders, 'phd THESIS')?.id, 'thesis');
  assert.equal(resolveFolder(folders, 'Kitchen'), undefined);
});

test('saving adds a note, credited to the model and the chat it came from', () => {
  const plan = planSave({
    memory: memory(),
    folder: 'About you',
    text: ' Vegetarian on weekdays ',
    chatId: 'chat-1',
    now: 5,
    newId,
  });
  assert.ok(plan.ok);
  const [saved] = plan.change.notes!;
  assert.equal(saved.text, 'Vegetarian on weekdays');
  assert.equal(saved.author, 'model');
  assert.equal(saved.sourceChatId, 'chat-1');
  assert.deepEqual(plan.write, {
    noteId: saved.id,
    action: 'added',
    text: 'Vegetarian on weekdays',
    folderId: MEMORY_ABOUT_FOLDER_ID,
  });
});

test('replacing keeps the note’s identity and remembers what it said before', () => {
  const plan = planSave({
    memory: memory(),
    folder: 'About you',
    text: 'Lives in Berlin',
    replaces: noteHandle('milan-0001'),
    chatId: 'chat-2',
    now: 9,
    newId,
  });
  assert.ok(plan.ok);
  assert.equal(plan.write.action, 'updated');
  assert.equal(plan.write.noteId, 'milan-0001');
  assert.equal(plan.write.before?.text, 'Lives in Milan');
  assert.equal(plan.change.notes![0].createdAt, 1);
  assert.equal(plan.change.notes![0].updatedAt, 9);
});

test('a new folder needs a description, and is made inside the one its path names', () => {
  const refused = planSave({
    memory: memory(),
    folder: 'Kitchen',
    text: 'Allergic to walnuts',
    chatId: 'c',
    now: 1,
    newId,
  });
  assert.equal(refused.ok, false);
  assert.match(refused.ok ? '' : refused.hint, /new_folder_description/);

  const nested = planSave({
    memory: memory(),
    folder: 'Projects/Dialogia',
    text: 'Local-first chat app',
    newFolderDescription: 'The chat app',
    chatId: 'c',
    now: 1,
    newId,
  });
  assert.ok(nested.ok);
  const [made] = nested.change.folders!;
  assert.equal(made.name, 'Dialogia');
  assert.equal(made.parentId, 'projects');
  assert.equal(nested.write.createdFolderId, made.id);

  const lost = planSave({
    memory: memory(),
    folder: 'Nowhere/Dialogia',
    text: 'x',
    newFolderDescription: 'y',
    chatId: 'c',
    now: 1,
    newId,
  });
  assert.equal(lost.ok, false);
});

test('a handle two notes share names neither; the whole id still does', () => {
  const notes = [note('abcdef12-one', 'about'), note('abcdef12-two', 'about')];
  assert.equal(resolveNote(notes, 'abcdef12'), undefined);
  assert.equal(resolveNote(notes, 'abcdef12-two')?.id, 'abcdef12-two');
  const refused = planForget({ memory: { ...memory(), notes }, note: 'abcdef12', now: 1 });
  assert.equal(refused.ok, false);
});

test('undo takes each kind of write back, and a folder the write made with it', () => {
  const m = memory();
  const added = planSave({
    memory: m,
    folder: 'Kitchen',
    text: 'Allergic to walnuts',
    newFolderDescription: 'Diet and cooking',
    chatId: 'c',
    now: 1,
    newId,
  });
  assert.ok(added.ok);
  const after = {
    folders: [...m.folders, ...added.change.folders!],
    notes: [...m.notes, ...added.change.notes!],
  };
  // A new note is forgotten, not deleted, and leaves the folder it made for the one above.
  const [saved] = added.change.notes!;
  assert.deepEqual(undoChange(added.write, after, 7), {
    notes: [{ ...saved, folderId: MEMORY_ABOUT_FOLDER_ID, forgottenAt: 7 }],
    deleteFolderIds: [added.write.createdFolderId],
  });
  // Something else moved into the folder meanwhile: it stays, and so does the note.
  const shared = { ...after, notes: [...after.notes, note('other-0001', added.write.folderId)] };
  assert.deepEqual(undoChange(added.write, shared, 7), {
    notes: [{ ...saved, forgottenAt: 7 }],
  });

  const forgot = planForget({ memory: m, note: 'milan-0001', now: 3 });
  assert.ok(forgot.ok);
  assert.equal(forgot.change.notes![0].forgottenAt, 3);
  const forgotten = { ...m, notes: forgot.change.notes! };
  assert.deepEqual(undoChange(forgot.write, forgotten, 7), { notes: [m.notes[0]] });
});

test('undo changes nothing once the note has changed since the write', () => {
  const m = memory();
  const saved = planSave({
    memory: m,
    folder: 'About you',
    text: 'Lives in Berlin',
    replaces: 'milan-0001',
    chatId: 'c',
    now: 5,
    newId,
  });
  assert.ok(saved.ok);
  const [written] = saved.change.notes!;
  const edited = { ...written, text: 'Lives in Berlin, in Kreuzberg', author: 'user' as const };
  const moved = { ...written, folderId: 'projects' };
  const forgotten = { ...written, forgottenAt: 6 };
  for (const now of [edited, moved, forgotten]) {
    assert.equal(undoChange(saved.write, { ...m, notes: [now] }, 7), undefined);
  }
  assert.equal(undoChange(saved.write, { ...m, notes: [] }, 7), undefined, 'or is gone');
  assert.deepEqual(undoChange(saved.write, { ...m, notes: [written] }, 7), {
    notes: [m.notes[0]],
  });
});

test('a write is marked taken back exactly, never an alike write in another version', () => {
  const before = note('n1', 'about', 'Plays viola');
  const write = {
    noteId: 'n1',
    action: 'updated' as const,
    text: 'Plays cello',
    folderId: 'about',
    before,
  };
  // The other version replaced the same note with the same words, from another note.
  const alike = { ...write, before: { ...before, text: 'Plays violin', updatedAt: 2 } };
  const reply = {
    id: 'r',
    chatId: 'c',
    role: 'assistant',
    content: 'Second try',
    memoryWrites: [write],
    versions: [{ content: 'First try', memoryWrites: [alike] }],
    versionIndex: 1,
  } as Message;
  const marked = markWriteUndone(reply, write);
  assert.equal(marked.memoryWrites![0].undone, true);
  assert.equal(marked.versions![0].memoryWrites![0].undone, undefined);
  // Shown the other version, the reply no longer holds the write clicked: nothing is marked.
  const switched = { ...reply, memoryWrites: [alike], versions: [{ memoryWrites: [write] }] };
  assert.equal(markWriteUndone(switched as Message, { ...write }), switched);
});

test('the prompt carries About you whole and one index line for each other folder', () => {
  const m = memory();
  const preamble = buildMemoryPreamble(m);
  assert.match(preamble, /\[milan-00\] Lives in Milan/);
  assert.match(preamble, /- Projects\/PhD thesis: PhD thesis things \(0 notes\)/);
  assert.match(preamble, /- Projects: Projects things \(0 notes, 1 subfolder\)/);
  assert.match(preamble, /- Learning: Learning things \(0 notes, plus their tutor chats\)/);
  assert.ok(!preamble.includes('About you: About you things'));
  // A forgotten note is out of the model's sight.
  const forgotten = buildMemoryPreamble({
    ...m,
    notes: [{ ...m.notes[0], forgottenAt: 2 }],
  });
  assert.ok(!forgotten.includes('Milan'));
  // About you keeps its newest 40 notes, and says where the rest are.
  const many = Array.from({ length: 45 }, (_, i) => ({
    ...note(`about-${i}`, MEMORY_ABOUT_FOLDER_ID, `Fact ${i}`),
    createdAt: i,
  }));
  const capped = buildMemoryPreamble({ ...m, notes: many });
  assert.ok(capped.includes('Fact 44') && !capped.includes('Fact 4\n'));
  assert.match(capped, /5 older notes: memory_read "About you"/);
});

const modelIndex = createModelIndex([
  {
    id: 'openai/gpt-test',
    name: 'Tools',
    context_length: 8000,
    pricing: { prompt: 1, completion: 1, currency: 'usd' },
  },
  {
    id: 'endpoint:local/plain',
    name: 'Plain',
    context_length: 8000,
    pricing: { prompt: 0, completion: 0, currency: 'usd' },
  },
]);

async function compose(modelId: string, opts: { chatOff?: boolean; everywhereOff?: boolean } = {}) {
  const chat = makeChat({
    settings: {
      modelId,
      features: {
        search: { enabled: false, provider: 'tavily' },
        ...(opts.chatOff ? { memory: { enabled: false } } : {}),
      },
    },
  });
  const store = createTestStore();
  store.setState({
    chats: [chat],
    memory: { ...memory(), loaded: true },
    ui: { ...store.getState().ui, ...(opts.everywhereOff ? { memoryEnabled: false } : {}) },
  });
  const ui = store.getState().ui;
  const settings = resolveTurnSettings({ chat, ui, modelIndex, modelId });
  return composeTurn({
    chat,
    ui,
    settings,
    modelIndex,
    prior: [],
    newUser: { content: 'Hi', attachments: [] },
    attachments: [],
    store: { get: store.getState, set: store.setState },
  });
}

test('a turn reads memory and may write it, on a model known to call tools', async () => {
  const result = await compose('openai/gpt-test');
  assert.ok(result.systemStable?.includes('## Memory'));
  assert.deepEqual(
    result.tools?.map((t) => t.function.name),
    ['memory_read', 'memory_save', 'memory_forget'],
  );
  assert.equal(result.shouldPlan, true);
});

test('a model not known to call tools reads memory but is offered no tools', async () => {
  const result = await compose('endpoint:local/plain');
  assert.ok(result.systemStable?.includes('## Memory'));
  assert.equal(result.tools, undefined);
  assert.equal(result.shouldPlan, false);
});

test('memory switched off, in the chat or everywhere, is neither read nor written', async () => {
  for (const off of [{ chatOff: true }, { everywhereOff: true }]) {
    const result = await compose('openai/gpt-test', off);
    assert.ok(!result.system?.includes('## Memory'));
    assert.equal(result.tools, undefined);
  }
});

test('the tools write to memory, keep each change on the reply, and undo it', async () => {
  const store = createTestStore();
  await store.getState().loadMemory();
  const reply = { id: 'reply-1', chatId: 'chat-1', role: 'assistant', content: '' } as Message;
  store.setState({
    messagesById: { [reply.id]: reply },
    messageIdsByChatId: { 'chat-1': [reply.id] },
  });
  const context = {
    chatId: 'chat-1',
    assistantMessage: reply,
    set: store.setState,
    get: store.getState,
    logger: { start: () => ({ success: () => undefined, error: () => undefined }) },
  } as unknown as ToolExecutionContext;
  const call = (name: string, args: Record<string, unknown>) =>
    getToolHandler(name)!({
      toolCall: { id: name, type: 'function', function: { name, arguments: '{}' } },
      parsedArgs: args,
      aggregatedResults: [],
      context,
    });

  const saved = await call('memory_save', { folder: 'About you', note: 'Plays the cello' });
  assert.equal(saved.result?.ok, true);
  const [write] = store.getState().messagesById[reply.id].memoryWrites!;
  assert.equal(write.action, 'added');
  assert.equal(write.text, 'Plays the cello');

  const read = await call('memory_read', { folder: 'about you' });
  assert.equal(read.result?.ok, true);
  assert.deepEqual(read.result?.notes, [`- [${noteHandle(write.noteId)}] Plays the cello`]);

  const bad = await call('memory_forget', { note: 'nothing' });
  assert.equal(bad.result?.ok, false);

  await store.getState().undoMemoryWrite(reply.id, 0);
  assert.equal(store.getState().messagesById[reply.id].memoryWrites![0].undone, true);
  const stored = await repository.loadMemory();
  assert.deepEqual(
    forgottenNotes(stored.notes).map((n) => n.text),
    ['Plays the cello'],
    'the note waits in Recently forgotten',
  );
});

test('two writes to one note in one reply are taken back newest first', async () => {
  const store = createTestStore();
  await store.getState().loadMemory();
  const reply = { id: 'reply-2', chatId: 'chat-2', role: 'assistant', content: '' } as Message;
  store.setState({
    messagesById: { [reply.id]: reply },
    messageIdsByChatId: { 'chat-2': [reply.id] },
  });
  const context = {
    chatId: 'chat-2',
    assistantMessage: reply,
    set: store.setState,
    get: store.getState,
  } as unknown as ToolExecutionContext;
  const save = (args: Record<string, unknown>) =>
    getToolHandler('memory_save')!({
      toolCall: { id: 's', type: 'function', function: { name: 'memory_save', arguments: '{}' } },
      parsedArgs: args,
      aggregatedResults: [],
      context,
    });

  await save({ folder: 'About you', note: 'Has a cat' });
  const [added] = store.getState().messagesById[reply.id].memoryWrites!;
  await save({ folder: 'About you', note: 'Has two cats', replaces: noteHandle(added.noteId) });
  const current = () => store.getState().memory.notes.find((n) => n.id === added.noteId)!;
  const writes = () => store.getState().messagesById[reply.id].memoryWrites!;

  await store.getState().undoMemoryWrite(reply.id, 0);
  assert.equal(current().text, 'Has two cats', 'the later write is not lost');
  assert.equal(writes()[0].undone, undefined);
  assert.match(store.getState().ui.notice ?? '', /changed since/);

  await store.getState().undoMemoryWrite(reply.id, 1);
  assert.equal(current().text, 'Has a cat');
  await store.getState().undoMemoryWrite(reply.id, 0);
  assert.ok(current().forgottenAt);
  assert.deepEqual(
    writes().map((w) => w.undone),
    [true, true],
  );
  const saved = await repository.getChatWithMessages('chat-2');
  assert.equal(saved.messages[0]?.memoryWrites?.[0]?.undone, true, 'the reply is saved');
});

test('a second click while Undo is writing finds the write taken back, and says nothing', async () => {
  const store = createTestStore();
  await store.getState().loadMemory();
  const added = await store.getState().addMemoryNote(MEMORY_ABOUT_FOLDER_ID, 'Has a dog');
  const reply = {
    id: 'reply-3',
    chatId: 'chat-3',
    role: 'assistant',
    content: '',
    memoryWrites: [
      { noteId: added!.id, action: 'added', text: 'Has a dog', folderId: MEMORY_ABOUT_FOLDER_ID },
    ],
  } as Message;
  store.setState({
    messagesById: { [reply.id]: reply },
    messageIdsByChatId: { 'chat-3': [reply.id] },
  });
  store.getState().setNotice(undefined);

  await Promise.all([
    store.getState().undoMemoryWrite(reply.id, 0),
    store.getState().undoMemoryWrite(reply.id, 0),
  ]);
  assert.equal(store.getState().ui.notice, undefined);
  assert.equal(store.getState().messagesById[reply.id].memoryWrites![0].undone, true);
  assert.ok(store.getState().memory.notes.find((n) => n.id === added!.id)?.forgottenAt);
});

test('Undo marks the version clicked, even when another is shown before it finishes', async () => {
  const store = createTestStore();
  await store.getState().loadMemory();
  const viola = await store.getState().addMemoryNote(MEMORY_ABOUT_FOLDER_ID, 'Plays viola');
  const now = { ...viola!, text: 'Plays cello', author: 'model' as const, updatedAt: 9 };
  await store.getState().changeMemory({ notes: [now] });
  const write = {
    noteId: now.id,
    action: 'updated' as const,
    text: 'Plays cello',
    folderId: MEMORY_ABOUT_FOLDER_ID,
    before: viola!,
  };
  // The other try made an alike write, from the note as it read then.
  const alike = { ...write, before: { ...viola!, text: 'Plays violin', updatedAt: 3 } };
  const reply = {
    id: 'reply-4',
    chatId: 'chat-4',
    role: 'assistant',
    content: 'Second try',
    memoryWrites: [write],
    versions: [{ content: 'First try', memoryWrites: [alike] }],
  } as Message;
  store.setState({
    messagesById: { [reply.id]: reply },
    messageIdsByChatId: { 'chat-4': [reply.id] },
  });

  const undoing = store.getState().undoMemoryWrite(reply.id, 0);
  store.setState((s) => ({
    messagesById: { [reply.id]: showVersion(s.messagesById[reply.id], 0) },
  }));
  await undoing;

  const shown = store.getState().messagesById[reply.id];
  assert.equal(shown.content, 'First try');
  assert.equal(shown.memoryWrites![0].undone, undefined, 'the alike write is not the one clicked');
  assert.equal(shown.versions![0].memoryWrites![0].undone, true);
  assert.equal(store.getState().memory.notes.find((n) => n.id === now.id)?.text, 'Plays viola');
  const saved = await repository.getChatWithMessages('chat-4');
  assert.equal(saved.messages[0]?.content, 'First try', 'the reply as it is now is saved');
  assert.equal(saved.messages[0]?.versions?.[0]?.memoryWrites?.[0]?.undone, true);
});
