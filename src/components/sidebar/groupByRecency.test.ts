import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupByRecency } from '@/components/sidebar/groupByRecency';
import type { Chat } from '@/lib/types';

const chat = (id: string, updatedAt: number) => ({ id, updatedAt, createdAt: updatedAt }) as Chat;

test('groupByRecency buckets chats by last touch and drops empty groups', () => {
  const now = new Date(2026, 8, 23, 15, 0).getTime();
  const day = 24 * 60 * 60 * 1000;
  const groups = groupByRecency(
    [chat('a', now - 60_000), chat('b', now - 3 * day), chat('c', now - 90 * day)],
    now,
  );
  assert.deepEqual(
    groups.map((g) => [g.label, g.chats.map((c) => c.id)]),
    [
      ['Today', ['a']],
      ['Previous 7 days', ['b']],
      ['Earlier', ['c']],
    ],
  );
});
