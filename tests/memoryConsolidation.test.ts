import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repository } from '@/lib/db';
import {
  applyOperations,
  consolidationRequest,
  notesSince,
  readOperations,
  restoreSnapshot,
} from '@/lib/memory/consolidate';
import { noteHandle } from '@/lib/memory/writes';
import { deleteKey, setKey } from '@/lib/keys/store';
import {
  MEMORY_ABOUT_FOLDER_ID,
  MEMORY_LEARNING_FOLDER_ID,
  type MemoryFolder,
  type MemoryNote,
} from '@/lib/types';
import { createTestStore } from './helpers/createTestStoreState';
import { mockFetch } from './helpers/mockFetch';

const folder = (id: string, name: string, parentId?: string): MemoryFolder => ({
  id,
  name,
  description: `${name} things`,
  createdAt: 1,
  updatedAt: 1,
  ...(parentId ? { parentId } : {}),
});

const note = (
  id: string,
  folderId: string,
  text: string,
  author: MemoryNote['author'] = 'model',
) => ({
  id,
  folderId,
  text,
  author,
  createdAt: 1,
  updatedAt: 1,
});

const memory = () => ({
  folders: [
    folder(MEMORY_ABOUT_FOLDER_ID, 'About you'),
    folder(MEMORY_LEARNING_FOLDER_ID, 'Learning'),
    folder('projects', 'Projects'),
    folder('empty', 'Old stuff'),
  ],
  notes: [
    note('dietA-001', MEMORY_ABOUT_FOLDER_ID, 'Vegetarian'),
    note('dietB-002', MEMORY_ABOUT_FOLDER_ID, 'Eats no meat on weekdays', 'user'),
    note('maths-001', MEMORY_ABOUT_FOLDER_ID, 'Likes worked examples'),
    note('thesis-01', MEMORY_ABOUT_FOLDER_ID, 'Writing a PhD thesis on tutors'),
  ],
});

let ids = 0;
const newId = () => `made-${(ids += 1)}`.padEnd(12, '0');

test('the model reads every live note under its folder, with its handle and author', () => {
  const request = consolidationRequest(memory());
  assert.match(request, /- Projects: Projects things/);
  assert.match(
    request,
    /\[dietB-00\] in About you \(written by the person, 1970-01-01\): Eats no meat/,
  );
});

test('an answer is read for its operations, whatever surrounds the JSON', () => {
  assert.deepEqual(
    readOperations('Sure!\n```json\n{"operations":[{"op":"forget","note":"x"}]}\n```'),
    [{ op: 'forget', note: 'x' }],
  );
  assert.deepEqual(readOperations('no json here'), []);
  assert.deepEqual(readOperations('{"operations": "nope"}'), []);
  assert.deepEqual(readOperations('{"operations": [1, null, {"op":"move"}]}'), [{ op: 'move' }]);
});

test('operations apply in order within the rules, and only what was done is said', () => {
  const { change, lines } = applyOperations({
    memory: memory(),
    now: 50,
    newId,
    operations: [
      {
        op: 'merge',
        notes: [noteHandle('dietA-001'), noteHandle('dietB-002')],
        text: 'Vegetarian on weekdays',
        say: 'Merged two notes about your diet',
      },
      { op: 'move', note: noteHandle('maths-001'), folder: 'Learning', say: 'Moved how you learn' },
      {
        op: 'new_folder',
        folder: 'Projects/PhD thesis',
        description: 'The thesis',
        say: 'New folder',
      },
      {
        op: 'move',
        note: noteHandle('thesis-01'),
        folder: 'Projects/PhD thesis',
        say: 'Filed the thesis',
      },
      { op: 'remove_folder', folder: 'Old stuff', say: 'Removed an empty folder' },
      { op: 'remove_folder', folder: 'About you', say: 'Never said' },
      { op: 'forget', note: 'nothing-at-all', say: 'Never said either' },
      {
        op: 'rewrite',
        note: noteHandle('dietA-001'),
        text: 'Vegetarian on weekdays',
        say: 'No change',
      },
    ],
  });
  assert.deepEqual(lines, [
    'Merged two notes about your diet',
    'Moved how you learn',
    'New folder',
    'Filed the thesis',
    'Removed an empty folder',
  ]);
  const byId = new Map(change.notes!.map((n) => [n.id, n]));
  assert.equal(byId.get('dietA-001')?.text, 'Vegetarian on weekdays');
  assert.equal(
    byId.get('dietB-002')?.forgottenAt,
    50,
    'the merged-away note waits in Recently forgotten',
  );
  assert.equal(byId.get('maths-001')?.folderId, MEMORY_LEARNING_FOLDER_ID);
  const made = change.folders!.find((f) => f.name === 'PhD thesis');
  assert.equal(made?.parentId, 'projects');
  assert.equal(byId.get('thesis-01')?.folderId, made?.id);
  assert.deepEqual(change.deleteFolderIds, ['empty']);
});

test('undo puts memory back exactly, removing what the pass made', () => {
  const before = memory();
  const { change } = applyOperations({
    memory: before,
    now: 5,
    newId,
    operations: [{ op: 'new_folder', folder: 'Kitchen', description: 'Food', say: 'x' }],
  });
  const after = { folders: [...before.folders, ...change.folders!], notes: before.notes };
  const back = restoreSnapshot(after, before);
  assert.deepEqual(back.deleteFolderIds, [change.folders![0].id]);
  assert.deepEqual(back.notes, before.notes);
});

test('the nudge counts live notes written since the last pass', () => {
  const notes = [
    { ...note('a', 'about', 'a'), updatedAt: 10 },
    { ...note('b', 'about', 'b'), updatedAt: 30 },
    { ...note('c', 'about', 'c'), updatedAt: 40, forgottenAt: 41 },
  ];
  assert.equal(notesSince(notes, 20), 1);
  assert.equal(notesSince(notes, undefined), 2);
});

test('a pass through the store: applied, reported, undone, and its record kept', async () => {
  await setKey('openrouter', 'sk-or-test');
  const answer = {
    operations: [
      { op: 'rewrite', note: '', text: 'Plays the cello well', say: 'Clarified your note' },
    ],
  };
  let body: { messages?: Array<{ content: string }> } = {};
  const restore = mockFetch(async (_url, init) => {
    body = JSON.parse(String(init?.body));
    return new Response(
      JSON.stringify({
        choices: [{ message: { role: 'assistant', content: JSON.stringify(answer) } }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  });
  try {
    const store = createTestStore();
    await store.getState().loadMemory();
    const added = await store.getState().addMemoryNote(MEMORY_ABOUT_FOLDER_ID, 'Plays cello');
    answer.operations[0].note = noteHandle(added!.id);

    await store.getState().consolidateMemory();
    assert.match(body.messages?.[1]?.content ?? '', /Plays cello/);
    const { pass, notes, consolidating } = store.getState().memory;
    assert.equal(consolidating, false);
    assert.deepEqual(pass?.lines, ['Clarified your note']);
    assert.equal(pass?.shown, true);
    assert.equal(notes.find((n) => n.id === added!.id)?.text, 'Plays the cello well');

    await store.getState().undoConsolidation();
    const stored = await repository.loadMemory();
    assert.equal(stored.notes.find((n) => n.id === added!.id)?.text, 'Plays cello');
    assert.equal(store.getState().memory.pass, undefined);
  } finally {
    restore();
    await deleteKey('openrouter');
  }
});
