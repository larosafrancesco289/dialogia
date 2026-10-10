import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChatCompletionMessages } from '@/lib/agent/prompt-builder';
import type { ModelMessage } from '@/lib/agent/types';
import type { Message, ModelDescriptor, PersistedAttachment } from '@/lib/types';
import { makeChat } from '../../../../tests/helpers/makeChat';

const chat = makeChat({ id: 'chat-attach', settings: { generation: { maxTokens: 1024 } } });

const model = (contextLength: number, inputModalities = ['text', 'image', 'audio']) =>
  ({
    id: 'provider/model',
    name: 'Model',
    context_length: contextLength,
    raw: { architecture: { input_modalities: inputModalities } },
  }) as ModelDescriptor;

let at = 0;
const user = (content: string, attachments?: PersistedAttachment[]): Message => ({
  id: `u${(at += 1)}`,
  chatId: chat.id,
  role: 'user',
  content,
  createdAt: at,
  ...(attachments ? { attachments } : {}),
});
const reply = (content: string): Message => ({
  id: `a${(at += 1)}`,
  chatId: chat.id,
  role: 'assistant',
  content,
  createdAt: at,
});

const image = (name: string): PersistedAttachment => ({
  id: name,
  kind: 'image',
  name,
  mime: 'image/png',
  dataURL: `data:image/png;base64,${name}`,
});
const audio: PersistedAttachment = {
  id: 'rec',
  kind: 'audio',
  name: 'rec.mp3',
  mime: 'audio/mpeg',
  dataURL: 'data:audio/mpeg;base64,QUJD',
  audioFormat: 'mp3',
};

const build = (priorMessages: Message[], models: ModelDescriptor[], newUserContent = 'Next?') =>
  buildChatCompletionMessages({ chat, priorMessages, models, newUserContent });

/** The text the model reads, and the files it is sent, message by message. */
const parts = (messages: ModelMessage[]) =>
  messages.map((m) =>
    typeof m.content === 'string'
      ? m.content
      : (m.content ?? []).map((block) => (block.type === 'text' ? block.text : block.type)),
  );

test('a PDF read earlier counts toward the budget, and is dropped like any other words', () => {
  const pdfText = 'lorem ipsum '.repeat(200_000);
  const prior = [
    user('read this', [
      {
        id: 'p',
        kind: 'pdf',
        name: 'big.pdf',
        mime: 'application/pdf',
        text: pdfText,
        pageCount: 500,
      },
    ]),
    reply('ok'),
  ];
  const sent = build(prior, [model(8000)], 'next question');
  assert.ok(JSON.stringify(sent).length < 10_000, 'the PDF is not sent to an 8k model');
  assert.deepEqual(parts(sent).at(-1), 'next question', 'the question still is');
});

test('images count toward the budget too', () => {
  // About 3,200 tokens of room: one message of two images fits, two do not.
  const prior = [
    user('first', [image('a.png'), image('b.png')]),
    reply('two cats'),
    user('second', [image('c.png'), image('d.png')]),
    reply('two dogs'),
  ];
  const sent = build(prior, [model(4200)]);
  assert.deepEqual(parts(sent), [
    'two cats',
    ['second', 'image_url', 'image_url'],
    'two dogs',
    'Next?',
  ]);
});

test('an earlier image or recording is a line naming it for a model that cannot take it in', () => {
  const prior = [
    user('look', [image('x.png')]),
    reply('a cat'),
    user('hear', [audio]),
    reply('hi'),
  ];
  const sent = build(prior, [model(100_000, ['text'])]);
  const json = JSON.stringify(sent);
  assert.ok(!json.includes('image_url') && !json.includes('input_audio'));
  assert.deepEqual(parts(sent).slice(0, 3), [
    ['look', '[image: x.png, which this model cannot see]'],
    'a cat',
    ['hear', '[audio: rec.mp3, which this model cannot hear]'],
  ]);
});

test('the capabilities a turn passes are the ones followed', () => {
  const sent = buildChatCompletionMessages({
    chat,
    priorMessages: [user('look', [image('x.png')]), reply('a cat')],
    models: [model(100_000)],
    newUserContent: 'and?',
    inputs: { canSee: false, canAudio: true },
  });
  assert.ok(!JSON.stringify(sent).includes('image_url'));
});

test('only the two latest messages with files send them; earlier files are named in a line', () => {
  const prior = [
    user('one', [image('1.png')]),
    reply('r1'),
    user('two', [image('2.png')]),
    reply('r2'),
    user('plain words'),
    reply('r3'),
    user('three', [image('3.png'), audio]),
    reply('r4'),
  ];
  const sent = build(prior, [model(100_000)], 'what about the first?');
  assert.deepEqual(parts(sent), [
    ['one', '[image: 1.png, shared earlier]'],
    'r1',
    ['two', 'image_url'],
    'r2',
    'plain words',
    'r3',
    ['three', 'image_url', 'input_audio'],
    'r4',
    'what about the first?',
  ]);
});

test('the new message sends its files, the one before it too, and a PDF’s text always goes', () => {
  const pdf: PersistedAttachment = {
    id: 'doc',
    kind: 'pdf',
    name: 'notes.pdf',
    mime: 'application/pdf',
    text: 'Chapter one',
  };
  const sent = buildChatCompletionMessages({
    chat,
    priorMessages: [
      user('old', [image('old.png'), pdf]),
      reply('r1'),
      user('mid', [image('mid.png')]),
      reply('r2'),
    ],
    models: [model(100_000)],
    newUserContent: 'new',
    newUserAttachments: [image('new.png')],
  });
  assert.deepEqual(parts(sent), [
    ['old', '[image: old.png, shared earlier]', '[Document: notes.pdf]\n\nChapter one'],
    'r1',
    ['mid', 'image_url'],
    'r2',
    ['new', 'image_url'],
  ]);
});
