import { test } from 'node:test';
import assert from 'node:assert/strict';
import { composeTurn } from '@/lib/agent/compose';
import { repository } from '@/lib/db';
import { buildMemoryPreamble } from '@/lib/memory/prompt';
import { noteHandle, planForget, planSave, resolveFolder, undoChange } from '@/lib/memory/writes';
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
  assert.deepEqual(undoChange(added.write, after), {
    deleteNoteIds: [added.write.noteId],
    deleteFolderIds: [added.write.createdFolderId],
  });
  // Something else moved into the folder meanwhile: it stays.
  const shared = { ...after, notes: [...after.notes, note('other-0001', added.write.folderId)] };
  assert.deepEqual(undoChange(added.write, shared), { deleteNoteIds: [added.write.noteId] });

  const forgot = planForget({ memory: m, note: 'milan-0001', now: 3 });
  assert.ok(forgot.ok);
  assert.equal(forgot.change.notes![0].forgottenAt, 3);
  assert.deepEqual(undoChange(forgot.write, m), { notes: [m.notes[0]] });
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

  await store.getState().undoMemoryWrite(reply.id, write.noteId);
  assert.equal(store.getState().messagesById[reply.id].memoryWrites![0].undone, true);
  const stored = await repository.loadMemory();
  assert.ok(!stored.notes.some((n) => n.id === write.noteId), 'the note is gone for good');
});
