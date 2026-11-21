import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildChatMarkdownFilename, formatChatAsMarkdown } from '@/lib/settings/chatMarkdown';
import type { Message, ModelDescriptor } from '@/lib/types';
import { makeChat } from '../../../tests/helpers/makeChat';

test('buildChatMarkdownFilename turns titles into clean .md slugs', () => {
  assert.equal(buildChatMarkdownFilename('Rust Borrow Checker!'), 'rust-borrow-checker.md');
  assert.equal(buildChatMarkdownFilename('Café & Résumé'), 'cafe-resume.md');
  assert.equal(buildChatMarkdownFilename('   ???   '), 'chat.md');
});

test('buildChatMarkdownFilename keeps kana voicing marks and Hangul syllables whole', () => {
  assert.equal(buildChatMarkdownFilename('がっこう ガイド'), 'がっこう-ガイド.md');
  assert.equal(buildChatMarkdownFilename('한국어 공부'), '한국어-공부.md');
  assert.equal(buildChatMarkdownFilename('Άλγεβρα'), 'αλγεβρα.md');
  assert.equal(buildChatMarkdownFilename('हिन्दी व्याकरण'), 'हिन्दी-व्याकरण.md');
});

test('formatChatAsMarkdown writes headings, model labels, attachments, and cited sources', () => {
  const chat = makeChat({
    id: 'c1',
    title: 'Linear Algebra',
    updatedAt: Date.UTC(2026, 4, 10),
    settings: { modelId: 'anthropic/claude-sonnet-4' },
  });
  const models: ModelDescriptor[] = [
    { id: 'anthropic/claude-sonnet-4', name: 'Anthropic: Claude Sonnet 4' },
  ];
  const messages: Message[] = [
    {
      id: 'm1',
      chatId: 'c1',
      role: 'user',
      content: 'Hidden system bootstrap',
      createdAt: 1,
      metadata: { hiddenFromUser: true },
    },
    {
      id: 'm2',
      chatId: 'c1',
      role: 'user',
      content: 'Explain eigenvalues.',
      createdAt: 2,
      attachments: [
        {
          id: 'a1',
          kind: 'text',
          name: 'matrix.py',
          mime: 'text/plain',
          text: 'import numpy as np',
        },
      ],
    },
    {
      id: 'm3',
      chatId: 'c1',
      role: 'assistant',
      model: 'anthropic/claude-sonnet-4',
      content: 'An eigenvector only scales under a linear transformation [1].',
      createdAt: 3,
      searchSources: [
        { title: 'Eigenvalues [notes]', url: 'https://example.com/eigen(1)' },
        { title: 'Bad link', url: 'javascript:alert(1)' },
      ],
    },
  ];

  const md = formatChatAsMarkdown({ chat, messages, models });
  assert.ok(md.startsWith('# Linear Algebra\n'));
  assert.ok(!md.includes('Hidden system bootstrap'), 'hidden messages are omitted');
  assert.ok(md.includes('## You'));
  assert.ok(md.includes('_Attached: matrix.py_'));
  assert.ok(md.includes('Explain eigenvalues.'));
  assert.ok(md.includes('## Claude Sonnet 4'));
  assert.ok(md.includes('An eigenvector only scales under a linear transformation [1].'));
  assert.ok(md.includes('1. [Eigenvalues \\[notes\\]](<https://example.com/eigen(1)>)'));
  assert.ok(!md.includes('javascript:'), 'non-http(s) source links are dropped');
});

test('formatChatAsMarkdown strips newlines from chat titles', () => {
  const chat = makeChat({ id: 'c2', title: 'Line one\n## Injected' });
  const md = formatChatAsMarkdown({ chat, messages: [] });
  assert.ok(md.startsWith('# Line one ## Injected\n'));
});
