import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeUsageSummary } from '@/lib/ui/usageSummary';
import { createMemoryDb } from '@/lib/db/memory';
import { createRepository } from '@/lib/db/repository';
import type { ModelDescriptor } from '@/lib/types';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 10);

const MODELS: ModelDescriptor[] = [
  {
    id: 'anthropic/claude-sonnet-4',
    name: 'Anthropic: Claude Sonnet 4',
    pricing: { prompt: 3e-6, completion: 15e-6, currency: 'USD' },
  },
  {
    id: 'openai/gpt-4o-mini',
    name: 'OpenAI: GPT-4o mini',
    pricing: { prompt: 0.15e-6, completion: 0.6e-6, currency: 'USD' },
  },
];

test('computeUsageSummary filters by window, aggregates tokens and spend, and sorts models by cost', () => {
  const records = [
    {
      createdAt: NOW - 2 * DAY,
      model: 'anthropic/claude-sonnet-4',
      tokensIn: 1000,
      tokensOut: 500,
    },
    {
      createdAt: NOW - 15 * DAY,
      model: 'openai/gpt-4o-mini',
      tokensIn: 2000,
      tokensOut: 1000,
      usage: { prompt_tokens: 2000, completion_tokens: 1000, cost: 0.002 },
    },
    {
      createdAt: NOW - 45 * DAY,
      model: 'openai/gpt-4o-mini',
      tokensIn: 500,
      tokensOut: 200,
    },
  ];

  const week = computeUsageSummary(records, MODELS, '7d', NOW);
  assert.equal(week.replies, 1);
  assert.equal(week.tokensIn, 1000);
  assert.equal(week.tokensOut, 500);
  assert.ok(Math.abs(week.totalCost - (1000 * 3e-6 + 500 * 15e-6)) < 1e-9);

  const month = computeUsageSummary(records, MODELS, '30d', NOW);
  assert.equal(month.replies, 2);
  assert.equal(month.tokensIn, 3000);
  assert.equal(month.tokensOut, 1500);
  assert.deepEqual(
    month.byModel.map((m) => m.modelId),
    ['anthropic/claude-sonnet-4', 'openai/gpt-4o-mini'],
  );

  const all = computeUsageSummary(records, MODELS, 'all', NOW);
  assert.equal(all.replies, 3);
  assert.equal(all.byModel[1]?.replies, 2);
});

test('repository.loadUsageRecords counts assistant replies and alternate versions while skipping user rows', async () => {
  const repo = createRepository(createMemoryDb());
  await repo.saveMessages([
    { id: 'u1', chatId: 'c1', role: 'user', content: 'Hi', createdAt: 10 },
    {
      id: 'w1',
      chatId: 'c1',
      role: 'assistant',
      content: 'Welcome!',
      tutorWelcome: true,
      createdAt: 15,
    },
    {
      id: 'a1',
      chatId: 'c1',
      role: 'assistant',
      content: 'Second try',
      model: 'anthropic/claude-sonnet-4',
      tokensIn: 120,
      tokensOut: 60,
      createdAt: 20,
      versions: [
        {
          content: 'First try',
          model: 'openai/gpt-4o-mini',
          tokensIn: 100,
          tokensOut: 40,
        },
      ],
    },
  ]);

  const loaded = await repo.loadUsageRecords();
  assert.equal(loaded.length, 2);
  assert.deepEqual(
    loaded.map((r) => ({ model: r.model, in: r.tokensIn, out: r.tokensOut })),
    [
      { model: 'anthropic/claude-sonnet-4', in: 120, out: 60 },
      { model: 'openai/gpt-4o-mini', in: 100, out: 40 },
    ],
  );
});
