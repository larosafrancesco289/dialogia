// ChatGPT's and Claude's conversations.json come in as chats: the branch
// shown, in order, with only the person's and the assistant's words; the
// unreadable are counted, and a second import doubles nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { repository } from '@/lib/db';
import {
  detectHistorySource,
  readConversation,
  type ImportedConversation,
} from '@/lib/historyImport/parse';
import { BATCH_LIMITS, importFolderId, importHistory } from '@/lib/historyImport/importHistory';
import { importFile } from '@/lib/settings/transfer';

// ChatGPT ---------------------------------------------------------------------

type GptNode = {
  id: string;
  parent?: string;
  role?: string;
  parts?: unknown[];
  kind?: string;
  at?: number;
  recipient?: string;
  metadata?: Record<string, unknown>;
  noMessage?: boolean;
};

function gptConversation(
  id: string,
  nodes: GptNode[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const mapping: Record<string, unknown> = {};
  for (const node of nodes) {
    mapping[node.id] = {
      id: node.id,
      parent: node.parent ?? null,
      children: nodes.filter((n) => n.parent === node.id).map((n) => n.id),
      message: node.noMessage
        ? null
        : {
            id: node.id,
            author: { role: node.role ?? 'user' },
            create_time: node.at ?? null,
            content: { content_type: node.kind ?? 'text', parts: node.parts ?? [] },
            recipient: node.recipient ?? 'all',
            metadata: node.metadata ?? {},
          },
    };
  }
  return {
    id,
    conversation_id: id,
    title: `Title ${id}`,
    create_time: 1_700_000_000,
    update_time: 1_700_000_500,
    mapping,
    current_node: nodes[nodes.length - 1]?.id,
    ...extra,
  };
}

const read = (source: 'chatgpt' | 'claude', raw: unknown) => {
  const result = readConversation(source, raw);
  assert.ok(result && result !== 'empty', `expected a conversation, got ${String(result)}`);
  return result as ImportedConversation;
};

const turns = (conversation: ImportedConversation) =>
  conversation.messages.map((m) => `${m.role}: ${m.content}`);

test('the shape of the file says which export it is', () => {
  assert.equal(detectHistorySource([gptConversation('a', [])]), 'chatgpt');
  assert.equal(detectHistorySource([{ uuid: 'a', chat_messages: [] }]), 'claude');
  assert.equal(detectHistorySource({ chats: [] }), undefined);
  assert.equal(detectHistorySource([1, 'two']), undefined);
});

test('ChatGPT: the branch shown is followed from current_node to the root', () => {
  const conversation = gptConversation('branchy', [
    { id: 'root', noMessage: true },
    {
      id: 'sys',
      parent: 'root',
      role: 'system',
      parts: ['You are ChatGPT'],
      metadata: { is_visually_hidden_from_conversation: true },
    },
    { id: 'u1', parent: 'sys', parts: ['First question'], at: 1_700_000_010 },
    { id: 'a1-old', parent: 'u1', role: 'assistant', parts: ['Old answer'], at: 1_700_000_020 },
    { id: 'a1', parent: 'u1', role: 'assistant', parts: ['New answer'], at: 1_700_000_030 },
    { id: 'u2', parent: 'a1', parts: ['Follow-up'], at: 1_700_000_040 },
  ]);
  const result = read('chatgpt', conversation);
  assert.equal(result.id, 'chatgpt-branchy');
  assert.equal(result.title, 'Title branchy');
  assert.deepEqual(turns(result), [
    'user: First question',
    'assistant: New answer',
    'user: Follow-up',
  ]);
  assert.equal(result.messages[0].createdAt, 1_700_000_010_000);
  assert.equal(result.createdAt, 1_700_000_000_000);

  // Pointing current_node at the older reply follows that branch instead.
  const older = read('chatgpt', { ...conversation, current_node: 'a1-old' });
  assert.deepEqual(turns(older), ['user: First question', 'assistant: Old answer']);
});

test('ChatGPT: tool calls, tool output, thoughts and empty nodes are left out', () => {
  const result = read(
    'chatgpt',
    gptConversation('tools', [
      { id: 'root', noMessage: true },
      { id: 'u1', parent: 'root', parts: ['Plot this'] },
      { id: 'think', parent: 'u1', role: 'assistant', kind: 'thoughts', parts: [] },
      {
        id: 'call',
        parent: 'think',
        role: 'assistant',
        kind: 'code',
        recipient: 'python',
        parts: [],
      },
      { id: 'out', parent: 'call', role: 'tool', kind: 'execution_output', parts: ['42'] },
      { id: 'a1', parent: 'out', role: 'assistant', parts: ['Here is the plot.'] },
      { id: 'blank', parent: 'a1', role: 'assistant', parts: ['   '] },
      { id: 'a2', parent: 'blank', role: 'assistant', parts: ['It rises.'] },
    ]),
  );
  // The reply split around a tool call reads as one.
  assert.deepEqual(turns(result), ['user: Plot this', 'assistant: Here is the plot.\n\nIt rises.']);
});

test('ChatGPT: pictures and files become notes, citations markers go', () => {
  const result = read(
    'chatgpt',
    gptConversation('media', [
      {
        id: 'u1',
        kind: 'multimodal_text',
        parts: [
          { content_type: 'image_asset_pointer', asset_pointer: 'file-service://x' },
          'What is this?',
        ],
      },
      {
        id: 'a1',
        parent: 'u1',
        role: 'assistant',
        parts: ['A catciteturn0search0.'],
      },
      {
        id: 'u2',
        parent: 'a1',
        parts: ['Summarise it'],
        metadata: { attachments: [{ name: 'report.pdf', mime_type: 'application/pdf' }] },
      },
      {
        id: 'u3',
        parent: 'u2',
        role: 'assistant',
        kind: 'multimodal_text',
        parts: [{ content_type: 'audio_transcription', text: 'Spoken words' }],
      },
    ]),
  );
  assert.deepEqual(turns(result), [
    'user: [Picture not included]\n\nWhat is this?',
    'assistant: A cat.',
    'user: [File not included: report.pdf]\n\nSummarise it',
    'assistant: Spoken words',
  ]);
});

test('ChatGPT: times rise strictly even when the export has none', () => {
  const result = read(
    'chatgpt',
    gptConversation('timeless', [
      { id: 'u1', parts: ['a'] },
      { id: 'a1', parent: 'u1', role: 'assistant', parts: ['b'] },
      { id: 'u2', parent: 'a1', parts: ['c'] },
    ]),
  );
  const times = result.messages.map((m) => m.createdAt);
  assert.ok(times[0] < times[1] && times[1] < times[2], times.join(','));
});

test('ChatGPT: a conversation with nothing to say is empty, a broken one unreadable', () => {
  assert.equal(readConversation('chatgpt', gptConversation('none', [])), 'empty');
  assert.equal(
    readConversation(
      'chatgpt',
      gptConversation('sys', [{ id: 's', role: 'system', parts: ['x'] }]),
    ),
    'empty',
  );
  assert.equal(readConversation('chatgpt', { mapping: 'nope' }), undefined);
  assert.equal(readConversation('chatgpt', 'text'), undefined);
});

// Claude ----------------------------------------------------------------------

const claudeMessage = (
  uuid: string,
  sender: string,
  text: string,
  extra: Record<string, unknown> = {},
) => ({
  uuid,
  sender,
  text,
  content: [{ type: 'text', text }],
  created_at: `2025-01-01T00:00:${uuid.padStart(2, '0').slice(-2)}Z`,
  attachments: [],
  files: [],
  ...extra,
});

test('Claude: text blocks are kept; tool use, thinking and empty messages are not', () => {
  const result = read('claude', {
    uuid: 'conv-1',
    name: 'About fractions',
    created_at: '2025-01-01T00:00:00Z',
    updated_at: '2025-01-02T00:00:00Z',
    chat_messages: [
      claudeMessage('1', 'human', 'What is 1/2 + 1/3?'),
      claudeMessage('2', 'assistant', '', {
        content: [
          { type: 'thinking', thinking: 'Common denominator' },
          { type: 'tool_use', name: 'calc', input: {} },
          { type: 'tool_result', content: [] },
          { type: 'text', text: 'It is 5/6.' },
        ],
      }),
      claudeMessage('3', 'human', '', { content: [] }),
      claudeMessage('4', 'human', 'Thanks', {
        attachments: [{ file_name: 'notes.txt', extracted_content: 'secret notes' }],
        files: [{ file_name: 'photo.png', file_kind: 'image' }],
      }),
      { uuid: '5', sender: 'system', text: 'ignored' },
      'garbage',
    ],
  });
  assert.equal(result.id, 'claude-conv-1');
  assert.equal(result.title, 'About fractions');
  assert.deepEqual(turns(result), [
    'user: What is 1/2 + 1/3?',
    'assistant: It is 5/6.',
    'user: [File not included: notes.txt]\n\n[File not included: photo.png]\n\nThanks',
  ]);
  assert.equal(result.createdAt, Date.parse('2025-01-01T00:00:00Z'));
  assert.equal(result.updatedAt, Date.parse('2025-01-02T00:00:00Z'));
});

test('Claude: messages that name their parent follow the newest branch', () => {
  const root = '00000000-0000-4000-8000-000000000000';
  const result = read('claude', {
    uuid: 'conv-2',
    name: '',
    chat_messages: [
      claudeMessage('1', 'human', 'Hi', { parent_message_uuid: root }),
      claudeMessage('2', 'assistant', 'Hello', { parent_message_uuid: '1' }),
      claudeMessage('3', 'human', 'First try', { parent_message_uuid: '2' }),
      claudeMessage('4', 'assistant', 'Answer to first try', { parent_message_uuid: '3' }),
      claudeMessage('5', 'human', 'Edited try', { parent_message_uuid: '2' }),
      claudeMessage('6', 'assistant', 'Answer to edit', { parent_message_uuid: '5' }),
    ],
  });
  assert.deepEqual(turns(result), [
    'user: Hi',
    'assistant: Hello',
    'user: Edited try',
    'assistant: Answer to edit',
  ]);
  assert.equal(result.title, '');
});

test('Claude: falls back to the plain text when there are no content blocks', () => {
  const result = read('claude', {
    uuid: 'conv-3',
    chat_messages: [{ uuid: 'm', sender: 'human', text: 'Old export', created_at: 'nope' }],
  });
  assert.deepEqual(turns(result), ['user: Old export']);
});

// Into the database -------------------------------------------------------------

test('an import brings readable chats in, counts the unreadable, and doubles nothing', async () => {
  const entries = [
    gptConversation('keep-1', [
      { id: 'u', parts: ['Hello there'] },
      { id: 'a', parent: 'u', role: 'assistant', parts: ['General Kenobi'] },
    ]),
    gptConversation('keep-2', [{ id: 'u', parts: ['Second chat'] }], { title: null }),
    'not a conversation',
    { mapping: 42 },
    gptConversation('empty', []),
  ];
  const progress: number[] = [];
  const first = await importHistory('chatgpt', entries, (p) => progress.push(p.done));
  assert.equal(first.ok, true);
  assert.equal(
    first.ok && first.notice,
    'Imported 2 chats from ChatGPT, into the folder “From ChatGPT”. 2 could not be read.',
  );
  assert.equal(progress[0], 0);
  assert.equal(progress[progress.length - 1], entries.length);

  const [chat1, chat2] = await repository.loadChats(['chatgpt-keep-1', 'chatgpt-keep-2']);
  assert.equal(chat1.title, 'Title keep-1');
  assert.equal(chat2.title, 'New chat');
  assert.equal(chat1.folderId, importFolderId('chatgpt'));
  assert.equal(chat1.settings.features.tutor?.enabled ?? false, false);
  const [folder] = await repository.loadFolders([importFolderId('chatgpt')]);
  assert.equal(folder.name, 'From ChatGPT');
  const messages = await repository.loadMessagesForChat('chatgpt-keep-1');
  assert.deepEqual(
    messages.map((m) => [m.role, m.content]),
    [
      ['user', 'Hello there'],
      ['assistant', 'General Kenobi'],
    ],
  );

  // What was done here since stays; the export's messages are not added twice.
  await repository.saveChat({ ...chat1, title: 'Renamed here', folderId: undefined });
  await repository.saveFolder({ ...folder, name: 'My old chats' });
  const second = await importHistory('chatgpt', entries);
  assert.equal(
    second.ok && second.notice,
    'Imported 2 chats from ChatGPT, into the folder “My old chats”. 2 could not be read.',
  );
  const [again] = await repository.loadChats(['chatgpt-keep-1']);
  assert.equal(again.title, 'Renamed here');
  assert.equal(again.folderId, undefined);
  assert.equal((await repository.loadMessagesForChat('chatgpt-keep-1')).length, 2);
  const all = await repository.exportAll();
  assert.equal(all.chats.filter((c) => c.id.startsWith('chatgpt-keep-')).length, 2);
  assert.equal(all.folders.filter((f) => f.id === importFolderId('chatgpt')).length, 1);
});

test('a large export goes in batches', async () => {
  const saved = { ...BATCH_LIMITS };
  BATCH_LIMITS.chats = 3;
  try {
    const entries = Array.from({ length: 10 }, (_, i) =>
      gptConversation(`batch-${i}`, [{ id: 'u', parts: [`Chat ${i}`] }]),
    );
    const progress: number[] = [];
    const result = await importHistory('chatgpt', entries, (p) => progress.push(p.done));
    assert.match(result.ok ? result.notice : '', /^Imported 10 chats from ChatGPT/);
    assert.deepEqual(progress, [0, 3, 6, 9, 10]);
  } finally {
    Object.assign(BATCH_LIMITS, saved);
  }
});

test('an export with only unreadable or empty conversations says so', async () => {
  const unreadable = await importHistory('claude', [{ chat_messages: 'x' }]);
  assert.equal(unreadable.ok, false);
  assert.match(unreadable.ok ? '' : unreadable.error, /None of the chats/);
  const empty = await importHistory('claude', [{ uuid: 'e', chat_messages: [] }]);
  assert.equal(empty.ok ? '' : empty.error, 'This Claude export has no chats in it.');
});

// Files -----------------------------------------------------------------------

/** A minimal zip: one local header and directory entry per file, deflated or stored. */
function zip(files: { name: string; text: string; store?: boolean }[]): Blob {
  const chunks: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const raw = Buffer.from(file.text);
    const data = file.store ? raw : deflateRawSync(raw);
    const name = Buffer.from(file.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(file.store ? 0 : 8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    chunks.push(local, name, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(file.store ? 0 : 8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    directory.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const dir = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return new Blob([new Uint8Array(Buffer.concat([...chunks, dir, end]))]);
}

test('a data export can be chosen as the .zip it came in', async () => {
  const conversations = JSON.stringify([
    gptConversation('zipped', [{ id: 'u', parts: ['From inside a zip'] }]),
  ]);
  const archive = zip([
    { name: 'user.json', text: '{}', store: true },
    { name: 'file-abc.png', text: 'not really a png' },
    { name: 'conversations.json', text: conversations },
  ]);
  const result = await importFile(archive);
  assert.equal(result.ok, true, result.ok ? '' : result.error);
  const [message] = await repository.loadMessagesForChat('chatgpt-zipped');
  assert.equal(message.content, 'From inside a zip');

  const stored = await importFile(
    zip([{ name: 'export/conversations.json', text: conversations, store: true }]),
  );
  assert.equal(stored.ok, true);

  const missing = await importFile(zip([{ name: 'chat.html', text: '<p>' }]));
  assert.equal(missing.ok, false);
  assert.match(missing.ok ? '' : missing.error, /no conversations\.json/);
});

test('the history button turns a Dialogia backup away; the backup button takes either', async () => {
  const backup = JSON.stringify({
    chats: [{ id: 'backup-chat', title: 'B', createdAt: 1, updatedAt: 1, settings: {} }],
  });
  const refused = await importFile(new Blob([backup]), { historyOnly: true });
  assert.match(refused.ok ? '' : refused.error, /Dialogia backup/);
  assert.deepEqual(await repository.loadChats(['backup-chat']), []);

  const unknown = await importFile(new Blob(['{"hello":1}']), { historyOnly: true });
  assert.match(unknown.ok ? '' : unknown.error, /not a ChatGPT or Claude export/);

  const claude = JSON.stringify([
    { uuid: 'via-backup-button', chat_messages: [claudeMessage('1', 'human', 'Hi')] },
  ]);
  const either = await importFile(new Blob([claude]));
  assert.equal(either.ok, true);
  assert.equal((await repository.loadChats(['claude-via-backup-button'])).length, 1);
});
