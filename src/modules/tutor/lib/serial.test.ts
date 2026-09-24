import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSerialQueue } from '@/modules/tutor/lib/serial';

test('queued tasks never overlap, even when both wait on the same signal', async () => {
  const enqueue = createSerialQueue();
  let release!: () => void;
  const idle = new Promise<void>((resolve) => (release = resolve));
  const log: string[] = [];
  const send = (line: string) =>
    enqueue(async () => {
      await idle;
      log.push(`start ${line}`);
      await new Promise((resolve) => setTimeout(resolve, 5));
      log.push(`end ${line}`);
    });

  const both = Promise.all([send('quiz'), send('mark known')]);
  release();
  await both;
  assert.deepEqual(log, ['start quiz', 'end quiz', 'start mark known', 'end mark known']);
});

test('a failed task does not block the next one', async () => {
  const enqueue = createSerialQueue();
  const failed = enqueue(async () => {
    throw new Error('offline');
  });
  await assert.rejects(failed, /offline/);
  assert.equal(await enqueue(async () => 'sent'), 'sent');
});
